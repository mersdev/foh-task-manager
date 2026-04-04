import { nav } from './helpers';

describe('Temperature logging', () => {
  it('logs a temperature reading successfully', () => {
    const location = 'Cypress Temp Location ' + Date.now();

    cy.visit('/');
    nav('Temps');

    cy.get('input[placeholder*="Location"]', { timeout: 15000 }).type(location);
    cy.get('input[placeholder="Temp..."]').type('-2.5');
    cy.get('select').find('option').eq(1).then((opt) => {
      cy.get('select').select(String(opt.val()));
    });

    cy.contains('button', 'Log Reading').click();
    cy.contains('Temperature logged successfully', { timeout: 20000 }).should('be.visible');
    cy.contains(location, { timeout: 20000 }).should('be.visible');
  });
});
