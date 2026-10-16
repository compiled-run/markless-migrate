<?php

namespace App\Http\Controllers;

class ProfileController extends Controller
{
    public function show($id = null)
    {
        return view('profile');
    }

    public function update()
    {
        return back();
    }
}
