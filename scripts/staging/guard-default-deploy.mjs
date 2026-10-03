import {execFileSync} from 'node:child_process';

// Wrangler runs this before authentication, bundling and asset upload.
// Trust the branch supplied by Workers Builds; locally require a Git checkout.
let branch = process.env.WORKERS_CI_BRANCH;
if (!branch) {
  try { branch = execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(); }
  catch { branch = ''; }
}
if (branch !== 'main') {
  console.error('Default production deploy/preview blocked outside main. Use --config wrangler.staging.toml for staging.');
  process.exitCode = 1;
}
