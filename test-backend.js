
const { createClient } = require('@supabase/supabase-js');

// Test backend connectivity
async function testBackend() {
  console.log('🧪 Testing Backend Connectivity...\n');
  
  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}\n`);
  
  // Test Supabase client creation
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client created successfully');
    
    // Test database connection
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('❌ Database connection failed:', error.message);
    } else {
      console.log('✅ Database connection successful');
    }
    
    // Test auth service
    const { data: authData, error: authError } = await supabase.auth.getSession();
    
    if (authError) {
      console.log('⚠️  Auth service connection:', authError.message);
    } else {
      console.log('✅ Auth service connection successful');
    }
    
  } catch (error) {
    console.log('❌ Backend test failed:', error.message);
  }
  
  console.log('\n🧪 Backend test completed');
}

testBackend().catch(console.error);
