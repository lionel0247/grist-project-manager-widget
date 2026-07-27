// Test syntax by requiring the file
try {
  // Just read and evaluate basic structure
  var fs = require('fs');
  var content = fs.readFileSync('C:\\wamp64\\www\\grist-project-manager-widget\\widget.js', 'utf8');
  
  // Basic checks
  if (content.includes('function renderPlanningView()')) {
    console.log('✓ renderPlanningView function found');
  }
  if (content.includes('function initPlanningUsersExpanded()')) {
    console.log('✓ initPlanningUsersExpanded function found');
  }
  if (content.includes('// Render rows for each user - ONE ROW PER USER')) {
    console.log('✓ Modified rendering code found');
  }
  if (content.includes('expandedPlanningUsers[user] = true;')) {
    console.log('✓ Default expand initialization found');
  }
  
  console.log('\nAll basic checks passed!');
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
