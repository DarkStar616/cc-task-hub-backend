
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, full_name } = body;

    if (!email || !password) {
      return NextResponse.json({
        success: false,
        message: 'Email and password are required'
      }, { status: 400 });
    }

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
  } catch (error) {
    console.error('Error in register endpoint:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
