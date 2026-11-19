<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\JwtService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function __construct(private JwtService $jwt)
    {
    }

    public function register(Request $request)
    {
        $data = Validator::make($request->all(), [
            'name' => 'required|string|min:3',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8',
            'phone' => 'nullable|string|max:30',
            'citizenship_type' => 'required|in:domestic,international',
        ])->validate();

        $user = User::create([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'password' => Hash::make($data['password']),
            'phone' => $data['phone'] ?? null,
            'role' => 'user',
            'citizenship_type' => $data['citizenship_type'],
        ]);

        $token = $this->jwt->generate(['sub' => $user->id, 'role' => $user->role]);

        return response()->json([
            'token' => $token,
            'user' => $user,
        ], 201);
    }

    public function login(Request $request)
    {
        $data = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required|string',
        ])->validate();

        $user = User::where('email', strtolower($data['email']))->first();
        if (!$user || !Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        $token = $this->jwt->generate(['sub' => $user->id, 'role' => $user->role]);

        return response()->json([
            'token' => $token,
            'user' => $user,
        ]);
    }

    public function profile(Request $request)
    {
        return response()->json(['user' => $request->user()]);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $data = Validator::make($request->all(), [
            'name' => 'sometimes|string|min:3',
            'phone' => 'nullable|string|max:30',
            'citizenship_type' => 'sometimes|in:domestic,international',
            'current_password' => 'required_with:password|string',
            'password' => 'nullable|string|min:8|confirmed',
        ])->validate();

        $updates = [];

        if (array_key_exists('name', $data)) {
            $updates['name'] = $data['name'];
        }

        if (array_key_exists('phone', $data)) {
            $updates['phone'] = $data['phone'];
        }

        if (array_key_exists('citizenship_type', $data)) {
            if (
                $user->citizenship_type
                && $data['citizenship_type']
                && $data['citizenship_type'] !== $user->citizenship_type
            ) {
                return response()->json([
                    'message' => 'Jenis pengunjung tidak dapat diubah. Hubungi admin jika ada kesalahan data.',
                ], 422);
            }

            if (!$user->citizenship_type && $data['citizenship_type']) {
                $updates['citizenship_type'] = $data['citizenship_type'];
            }
        }

        if (!empty($data['password'])) {
            if (empty($data['current_password']) || !Hash::check($data['current_password'], $user->password)) {
                return response()->json(['message' => 'Password lama tidak sesuai'], 422);
            }
            $updates['password'] = Hash::make($data['password']);
        }

        if ($updates) {
            $user->update($updates);
        }

        return response()->json(['user' => $user->fresh()]);
    }

    public function forgotPassword(Request $request)
    {
        $data = Validator::make($request->all(), [
            'email' => 'required|email',
        ])->validate();

        $email = strtolower(trim($data['email']));
        $user = User::where('email', $email)->first();

        if (!$user) {
            return response()->json([
                'message' => 'Jika email terdaftar, link reset password telah dikirim ke inbox Anda.',
            ]);
        }

        $plainToken = Str::random(64);

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $email],
            [
                'token' => Hash::make($plainToken),
                'created_at' => now(),
            ]
        );

        $baseUrl = rtrim(config('app.frontend_url') ?: config('app.url') ?: $request->getSchemeAndHttpHost(), '/');
        if (str_contains($baseUrl, 'localhost') && !str_contains($request->getHost(), 'localhost')) {
            $baseUrl = rtrim($request->getSchemeAndHttpHost(), '/');
        }

        $resetUrl = $baseUrl . '/reset-password?token=' . urlencode($plainToken) . '&email=' . urlencode($email);

        $apiKey = config('services.brevo.api_key');
        $senderEmail = config('services.brevo.sender_email');
        $senderName = config('services.brevo.sender_name', 'Pura Lempuyang Tickets');

        if (empty($apiKey)) {
            Log::warning('BREVO_API_KEY belum dikonfigurasi. Reset URL: ' . $resetUrl);
            return response()->json([
                'message' => 'Layanan email belum dikonfigurasi (BREVO_API_KEY kosong). Hubungi admin.',
            ], 503);
        }

        $htmlContent = sprintf(
            '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f1c18;">' .
            '<h2 style="margin:0 0 12px;color:#b8860b;">Reset Password - Pura Lempuyang</h2>' .
            '<p>Halo %s,</p>' .
            '<p>Kami menerima permintaan untuk mereset password akun E-Ticketing Pura Lempuyang Anda. Klik tombol di bawah ini untuk membuat password baru:</p>' .
            '<p style="margin:24px 0;"><a href="%s" style="display:inline-block;background:#d4af37;color:#1f1c18;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:10px;">Reset Password</a></p>' .
            '<p style="font-size:12px;color:#666;">Link ini berlaku selama 60 menit. Jika Anda tidak merasa meminta reset password, abaikan email ini.</p>' .
            '</div>',
            e($user->name),
            e($resetUrl)
        );

        $response = Http::withHeaders([
            'api-key' => $apiKey,
            'accept' => 'application/json',
            'content-type' => 'application/json',
        ])->timeout(15)->post('https://api.brevo.com/v3/smtp/email', [
            'sender' => [
                'name' => $senderName,
                'email' => $senderEmail,
            ],
            'to' => [
                [
                    'email' => $user->email,
                    'name' => $user->name,
                ],
            ],
            'subject' => 'Reset Password Akun Pura Lempuyang',
            'htmlContent' => $htmlContent,
        ]);

        if (!$response->successful()) {
            Log::error('Brevo email error', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            return response()->json([
                'message' => 'Gagal mengirim email reset password. Pastikan konfigurasi Brevo sudah benar.',
            ], 500);
        }

        return response()->json([
            'message' => 'Jika email terdaftar, link reset password telah dikirim ke inbox Anda.',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $data = Validator::make($request->all(), [
            'email' => 'required|email',
            'token' => 'required|string',
            'password' => 'required|string|min:8|confirmed',
        ])->validate();

        $email = strtolower(trim($data['email']));
        $record = DB::table('password_reset_tokens')->where('email', $email)->first();

        if (!$record || !Hash::check($data['token'], $record->token)) {
            return response()->json([
                'message' => 'Link reset password tidak valid atau sudah digunakan.',
            ], 422);
        }

        if ($record->created_at && Carbon::parse($record->created_at)->addMinutes(60)->isPast()) {
            DB::table('password_reset_tokens')->where('email', $email)->delete();
            return response()->json([
                'message' => 'Link reset password sudah kedaluwarsa. Silakan minta link baru.',
            ], 422);
        }

        $user = User::where('email', $email)->first();
        if (!$user) {
            return response()->json([
                'message' => 'Akun tidak ditemukan.',
            ], 404);
        }

        $user->update([
            'password' => Hash::make($data['password']),
        ]);

        DB::table('password_reset_tokens')->where('email', $email)->delete();

        return response()->json([
            'message' => 'Password berhasil diperbarui. Silakan login dengan password baru Anda.',
        ]);
    }
}