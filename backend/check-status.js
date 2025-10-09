// check-status.js - System health check
import axios from 'axios';

const BRIDGE_URL = 'http://localhost:8081';
const API_URL = 'http://localhost:3001';

async function checkService(name, url) {
  try {
    const response = await axios.get(url, { timeout: 3000 });
    console.log(`✅ ${name}: Running`);
    return { name, status: 'running', data: response.data };
  } catch (error) {
    console.log(`❌ ${name}: Not responding`);
    return { name, status: 'down', error: error.message };
  }
}

async function checkSystemStatus() {
  console.log('\n🏥 ICU Control Station - System Status Check\n');
  console.log('='.repeat(50));
  
  // Check Bridge
  const bridge = await checkService('WebSocket Bridge', `${BRIDGE_URL}/health`);
  if (bridge.status === 'running') {
    console.log(`   Connected Clients: ${bridge.data.connectedClients}`);
    console.log(`   Patients Monitored: ${bridge.data.patientsMonitored}`);
  }
  
  console.log('');
  
  // Check API Server
  const api = await checkService('Backend API', `${API_URL}/health`);
  if (api.status === 'running') {
    console.log(`   Service: ${api.data.service}`);
  }
  
  console.log('');
  console.log('='.repeat(50));
  
  // Summary
  console.log('\n📊 Summary:');
  if (bridge.status === 'running' && api.status === 'running') {
    console.log('✅ All systems operational');
    console.log('\n💡 Next Steps:');
    if (bridge.data.patientsMonitored === 0) {
      console.log('   ⏳ System is ready and waiting for Kafka data');
      console.log('   📡 Consumer should be running and connected to Kafka');
      console.log('   🌐 Frontend should show "Monitoring Kafka Stream"');
    } else {
      console.log('   ✅ Receiving data from Kafka');
      console.log(`   👥 ${bridge.data.patientsMonitored} patients being monitored`);
    }
  } else {
    console.log('⚠️  Some services are not running:');
    if (bridge.status === 'down') {
      console.log('   ❌ Start bridge: npm run bridge');
    }
    if (api.status === 'down') {
      console.log('   ❌ Start API: npm run dev');
    }
  }
  
  console.log('\n🔗 URLs:');
  console.log(`   Frontend: http://localhost:3000`);
  console.log(`   Backend API: ${API_URL}`);
  console.log(`   WebSocket Bridge: ${BRIDGE_URL}`);
  console.log(`   Bridge Health: ${BRIDGE_URL}/health`);
  console.log('');
}

checkSystemStatus();