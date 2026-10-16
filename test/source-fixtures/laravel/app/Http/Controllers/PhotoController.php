<?php

namespace App\Http\Controllers;

class PhotoController extends Controller
{
    public function index()
    {
        return view('photos', ['seed' => random_int(1, 9)]);
    }

    public function store()
    {
    }

    public function destroy($photo)
    {
    }
}
