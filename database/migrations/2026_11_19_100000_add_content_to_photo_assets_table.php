<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('photo_assets') || Schema::hasColumn('photo_assets', 'content')) {
            return;
        }

        $driver = DB::getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE photo_assets ADD COLUMN content LONGBLOB NULL AFTER size');
        } else {
            Schema::table('photo_assets', function (Blueprint $table) {
                $table->binary('content')->nullable()->after('size');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('photo_assets') && Schema::hasColumn('photo_assets', 'content')) {
            Schema::table('photo_assets', function (Blueprint $table) {
                $table->dropColumn('content');
            });
        }
    }
};
