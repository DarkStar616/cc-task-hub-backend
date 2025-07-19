import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Handle general auth endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, email, password, full_name } = body;

    switch (action) {
      case 'login':
        return await handleLogin(email, password);
      case 'register':
        return await handleRegister(email, password, full_name);
      case 'logout':
        return await handleLogout();
      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid action specified'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in auth endpoint:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function handleLogin(email: string, password: string) {
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError) {
    return NextResponse.json({
      success: false,
      message: 'Login failed',
      error: loginError.message
    }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    message: 'Login successful',
    data: {
      user: loginData.user,
      session: loginData.session
    }
  });
}

async function handleRegister(email: string, password: string, full_name?: string) {
  // Validate @cootclub.com email requirement
  if (!email.endsWith('@cootclub.com')) {
    return NextResponse.json({
      success: false,
      message: 'Email must be from @cootclub.com domain'
    }, { status: 400 });
  }

  const { data: registerData, error: registerError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: full_name || null
      }
    }
  });

  if (registerError) {
    return NextResponse.json({
      success: false,
      message: 'Registration failed',
      error: registerError.message
    }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: 'Registration successful. Please check your email for verification.',
    data: {
      user: registerData.user
    }
  });
}

async function handleLogout() {
  const { error: logoutError } = await supabase.auth.signOut();

  if (logoutError) {
    return NextResponse.json({
      success: false,
      message: 'Logout failed',
      error: logoutError.message
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Logout successful'
  });
}