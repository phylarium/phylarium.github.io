'use strict';

// Release info, shared by the page and the service worker.
// release.sh bumps VERSION; deploy.sh sets CHANNEL ('beta' or 'stable') and BUILD in the published copy.
// BUILD changes with every deploy, so the service worker changes too and installed apps see the update.
const VERSION = '0.3.0';
const CHANNEL = 'beta';
const BUILD = '4083bbe-1793628580';
