<?php

use App\Http\Controllers\Api\PhotoQueueController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

// Sajikan foto dokumentasi langsung lewat Laravel (disk lokal + fallback database MySQL)
// agar tidak bergantung pada symlink public/storage maupun disk ephemeral Railway.
Route::get('/photo-assets/{photoAsset}', [PhotoQueueController::class, 'serveAsset'])
    ->whereNumber('photoAsset');

// Fallback static storage agar /storage/... tidak pernah jatuh ke halaman React NotFound.
Route::get('/storage/{path}', function (string $path) {
    $clean = str_replace('\\', '/', ltrim($path, '/'));
    if (str_contains($clean, '..') || !Storage::disk('public')->exists($clean)) {
        abort(404);
    }

    return response()->file(Storage::disk('public')->path($clean));
})->where('path', '.*');

Route::view('/{any?}', 'app')->where('any', '.*');
