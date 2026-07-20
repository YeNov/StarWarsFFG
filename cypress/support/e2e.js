// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import "./commands";

// Alternatively you can use CommonJS syntax:
// require('./commands')

// FORK-LOCAL SAFETY GUARD — PC Wizard implementation plan v4, Stage 1.
// Fails closed if the resolved baseUrl is not the expected local throwaway host,
// so a mis-set override can never point the destructive specs at a live world.
before(() => {
  const expected = Cypress.env("expectBaseUrl");
  const actual = Cypress.config("baseUrl");
  if (!expected) {
    throw new Error("Refusing to run: --env expectBaseUrl=<url> is required (see plan §0.3).");
  }
  if (actual !== expected) {
    throw new Error(`Refusing to run: resolved baseUrl is ${actual}, expected ${expected}.`);
  }
});
