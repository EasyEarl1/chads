// Simple test script to verify API endpoints
// Run with: node test-api.js

const API_BASE = 'http://localhost:3000/api';

async function testAPI() {
  console.log('🧪 Testing ClickTut API...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthRes = await fetch(`${API_BASE}/health`);
    const health = await healthRes.json();
    console.log('✅ Health check:', health);
    console.log('');

    // Test 2: Start tutorial
    console.log('2. Starting tutorial...');
    const startRes = await fetch(`${API_BASE}/tutorials/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Tutorial',
        description: 'API test'
      })
    });
    const startData = await startRes.json();
    console.log('✅ Tutorial started:', startData.tutorialId);
    const tutorialId = startData.tutorialId;
    console.log('');

    // Test 3: Record a click
    console.log('3. Recording click...');
    const clickRes = await fetch(`${API_BASE}/tutorials/${tutorialId}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepNumber: 1,
        timestamp: Date.now(),
        coordinates: { x: 100, y: 200 },
        element: {
          tag: 'button',
          id: 'test-btn',
          classes: ['btn', 'primary'],
          text: 'Test Button',
          selector: '#test-btn'
        },
        page: {
          url: 'https://example.com',
          title: 'Test Page',
          viewport: { width: 1920, height: 1080 }
        },
        screenshot: null // Optional for testing
      })
    });
    const clickData = await clickRes.json();
    console.log('✅ Click recorded:', clickData.stepNumber);
    console.log('');

    // Test 4: Stop recording
    console.log('4. Stopping tutorial...');
    const stopRes = await fetch(`${API_BASE}/tutorials/${tutorialId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const stopData = await stopRes.json();
    console.log('✅ Tutorial stopped:', stopData.clickCount, 'clicks');
    console.log('');

    // Test 5: Get tutorial
    console.log('5. Retrieving tutorial...');
    const getRes = await fetch(`${API_BASE}/tutorials/${tutorialId}`);
    const tutorial = await getRes.json();
    console.log('✅ Tutorial retrieved:', tutorial.tutorial.title);
    console.log('   Steps:', tutorial.tutorial.steps.length);
    console.log('');

    // Test 6: List all tutorials
    console.log('6. Listing all tutorials...');
    const listRes = await fetch(`${API_BASE}/tutorials`);
    const list = await listRes.json();
    console.log('✅ Tutorials list:', list.count, 'total');
    console.log('');

    console.log('🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Make sure the backend server is running on http://localhost:3000');
    process.exit(1);
  }
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ This script requires Node.js 18+ or install node-fetch');
  process.exit(1);
}

testAPI();

