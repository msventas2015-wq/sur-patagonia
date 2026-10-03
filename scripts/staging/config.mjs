// Public identities only. Runtime credentials belong to the provider/keychain.
export const STAGING = Object.freeze({
  host: 'staging.surpatagonian.com',
  origin: 'https://staging.surpatagonian.com',
  databaseOrigin: 'https://rsjwqmpseknvydistgfr.supabase.co',
  projectRef: 'rsjwqmpseknvydistgfr',
  environment: 'qa',
  workerName: 'sur-patagonia-staging',
});

export const PRODUCTION = Object.freeze({
  projectRef: 'wajkfydxutptcvvfwrvq',
  hosts: ['surpatagonian.com', 'www.surpatagonian.com',
    'surpatagonia.com.ar', 'www.surpatagonia.com.ar'],
});
