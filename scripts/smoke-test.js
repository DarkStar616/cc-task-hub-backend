
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

async function runSmokeTests() {
  console.log('🔥 Starting Backend Smoke Tests...\n');
  
  let passed = 0;
  let failed = 0;

  async function test(name, testFn) {
    try {
      console.log(`Testing: ${name}`);
      await testFn();
      console.log(`✅ PASS: ${name}\n`);
      passed++;
    } catch (error) {
      console.log(`❌ FAIL: ${name}`);
      console.log(`   Error: ${error.message}\n`);
      failed++;
    }
  }

  // Health Check
  await test('Health endpoint responds', async () => {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error('Health check returned failure');
  });

  // OpenAPI Documentation
  await test('OpenAPI documentation available', async () => {
    const response = await fetch(`${API_BASE.replace('/v1', '')}/openapi`);
    if (!response.ok) throw new Error(`OpenAPI endpoint failed: ${response.status}`);
    const data = await response.json();
    if (!data.openapi) throw new Error('Invalid OpenAPI specification');
  });

  // Auth endpoints (without authentication)
  await test('Auth endpoints return appropriate errors for missing auth', async () => {
    const endpoints = ['/users', '/tasks', '/analytics'];
    
    for (const endpoint of endpoints) {
      const response = await fetch(`${API_BASE}${endpoint}`);
      if (response.status !== 401) {
        throw new Error(`${endpoint} should return 401 for unauthenticated requests`);
      }
    }
  });

  // Task status validation
  await test('Task endpoints validate status enum', async () => {
    const response = await fetch(`${API_BASE}/tasks?status=invalid-status`);
    if (response.status !== 400 && response.status !== 401) {
      throw new Error('Tasks endpoint should validate status parameter');
    }
  });

  // Error response format
  await test('Error responses use standard format', async () => {
    const response = await fetch(`${API_BASE}/nonexistent-endpoint`);
    if (response.ok) throw new Error('Nonexistent endpoint should return error');
    
    const data = await response.json();
    if (typeof data.success !== 'boolean' || !data.message) {
      throw new Error('Error responses should follow standard format');
    }
  });

  console.log('\n🏁 Smoke Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests().catch(error => {
  console.error('💥 Smoke test runner failed:', error);
  process.exit(1);
});
