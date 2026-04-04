import { nav, openAdminFromSettings } from './helpers';

describe('Logs view', () => {
  it('shows checklist and temperature logs variants', () => {
    const location = 'Cypress Logs Temp ' + Date.now();

    openAdminFromSettings();

    nav('Temps');
    cy.get('input[placeholder*="Location"]', { timeout: 15000 }).type(location);
    cy.get('input[placeholder="Temp..."]').type('-3');
    cy.get('select').find('option').eq(1).then((opt) => {
      cy.get('select').select(String(opt.val()));
    });
    cy.contains('button', 'Log Reading').click();
    cy.contains('Temperature logged successfully', { timeout: 20000 }).should('be.visible');

    nav('Checklist');
    cy.get('body').then(($body) => {
      if ($body.find('button.bg-stone-100').length > 0) {
        cy.get('button.bg-stone-100').first().click();
        cy.contains('h3', 'Who completed this?', { timeout: 10000 }).should('be.visible');
        cy.get('div.fixed.inset-0').find('button').contains(/.+/).first().click();
      }
    });

    nav('Logs');
    cy.contains('h2', 'Completed Tasks', { timeout: 15000 }).should('be.visible');

    cy.contains('button', 'Temperatures').click();
    cy.contains('h2', 'Temperature Records', { timeout: 15000 }).should('be.visible');
    cy.contains(location, { timeout: 20000 }).should('be.visible');
  });
});
