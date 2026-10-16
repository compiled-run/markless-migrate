<?php

use App\Http\Controllers\PhotoController;
use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome', ['year' => date('Y')]);
});
Route::view('/about', 'about');
Route::get('/login', [ProfileController::class, 'login'])->name('login');

Route::middleware(['auth'])->group(function () {
    Route::get('/profile/{id?}', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
});

Route::prefix('admin')->middleware('role:admin')->group(function () {
    Route::resource('photos', PhotoController::class)->only(['index', 'store', 'destroy']);
});
