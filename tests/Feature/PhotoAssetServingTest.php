<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PhotoAsset;
use App\Models\PhotoPoint;
use App\Models\PhotoQueueEntry;
use App\Models\TicketType;
use App\Models\User;
use App\Models\VisitSlot;
use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PhotoAssetServingTest extends TestCase
{
    use RefreshDatabase;

    public function test_uploaded_photo_can_be_viewed_and_downloaded_even_after_disk_is_wiped(): void
    {
        Storage::fake('public');

        $operator = User::factory()->create(['role' => 'operator', 'citizenship_type' => 'domestic']);
        $visitor = User::factory()->create(['role' => 'user', 'citizenship_type' => 'domestic']);

        $ticketType = TicketType::create([
            'name' => 'Gate of Heaven Sunrise',
            'category' => 'domestic',
            'experience_code' => 'gate_of_heaven',
            'description' => 'Test',
            'price' => 45000,
            'capacity' => 50,
            'is_active' => true,
        ]);

        $slot = VisitSlot::create([
            'ticket_type_id' => $ticketType->id,
            'visit_date' => now()->toDateString(),
            'start_time' => '06:00:00',
            'end_time' => '08:00:00',
            'quota_total' => 50,
            'quota_remaining' => 49,
        ]);

        $order = Order::create([
            'order_code' => 'PL-TEST-001',
            'user_id' => $visitor->id,
            'ticket_type_id' => $ticketType->id,
            'visit_slot_id' => $slot->id,
            'quantity' => 1,
            'amount' => 45000,
            'status' => 'paid',
        ]);

        $point = PhotoPoint::create([
            'name' => 'Gate of Heaven',
            'location' => 'Spot Utama',
            'is_active' => true,
        ]);

        $entry = PhotoQueueEntry::create([
            'photo_point_id' => $point->id,
            'order_id' => $order->id,
            'visit_date' => now()->toDateString(),
            'queue_number' => 1,
            'status' => 'shooting',
        ]);

        $jwt = app(JwtService::class);
        $operatorToken = $jwt->generate(['sub' => $operator->id, 'role' => $operator->role]);
        $visitorToken = $jwt->generate(['sub' => $visitor->id, 'role' => $visitor->role]);

        // 1x1 PNG valid bytes (tidak butuh GD extension saat test)
        $pngBytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=');
        $fakePng = UploadedFile::fake()->createWithContent('sample.png', $pngBytes);

        // 1. Operator upload foto
        $uploadRes = $this->withHeader('Authorization', "Bearer {$operatorToken}")
            ->post('/api/photo/upload', [
                'entry_id' => $entry->id,
                'files' => [$fakePng],
            ]);

        $uploadRes->assertOk();
        $assetId = $uploadRes->json('assets.0.id');
        $this->assertNotNull($assetId);
        // Binary content tidak boleh bocor ke JSON
        $this->assertArrayNotHasKey('content', $uploadRes->json('assets.0'));

        $asset = PhotoAsset::findOrFail($assetId);
        $this->assertNotNull($asset->content);

        // 2. Simulasikan Railway restart: hapus seluruh file di disk public!
        Storage::disk('public')->delete($asset->file_path);
        $this->assertFalse(Storage::disk('public')->exists($asset->file_path));

        // 3. Pengunjung cek daftar foto miliknya
        $myAssetsRes = $this->withHeader('Authorization', "Bearer {$visitorToken}")
            ->getJson('/api/photo/my-assets');

        $myAssetsRes->assertOk()
            ->assertJsonPath('data.0.id', $assetId)
            ->assertJsonPath('data.0.url', "/photo-assets/{$assetId}")
            ->assertJsonPath('data.0.download_url', "/photo-assets/{$assetId}?download=1");

        // 4. Preview inline berhasil langsung dari fallback database
        $viewRes = $this->get("/photo-assets/{$assetId}");
        $viewRes->assertOk()
            ->assertHeader('Content-Type', 'image/png');
        $this->assertStringContainsString('inline;', (string) $viewRes->headers->get('Content-Disposition'));
        $this->assertSame($pngBytes, $viewRes->getContent());

        // 5. Unduh foto mengembalikan attachment header + bytes asli
        $downloadRes = $this->get("/photo-assets/{$assetId}?download=1");
        $downloadRes->assertOk()
            ->assertHeader('Content-Type', 'image/png');
        $this->assertStringContainsString('attachment;', (string) $downloadRes->headers->get('Content-Disposition'));
        $this->assertSame($pngBytes, $downloadRes->getContent());
    }
}
