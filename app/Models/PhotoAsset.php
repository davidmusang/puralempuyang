<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PhotoAsset extends Model
{
    use HasFactory;

    protected $fillable = ['photo_queue_entry_id', 'file_path', 'mime', 'size', 'content'];

    protected $hidden = ['content'];

    protected $appends = ['url', 'download_url'];

    public function entry()
    {
        return $this->belongsTo(PhotoQueueEntry::class, 'photo_queue_entry_id');
    }

    public function getUrlAttribute(): string
    {
        return "/photo-assets/{$this->id}";
    }

    public function getDownloadUrlAttribute(): string
    {
        return "/photo-assets/{$this->id}?download=1";
    }
}
