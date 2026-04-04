import { nav, openAdminFromSettings } from './helpers';

describe('Staff management', () => {
  it('adds a staff member successfully', () => {
    const staffName = 'Cypress Staff ' + Date.now();

    openAdminFromSettings();
    nav('Staff');

    cy.get('input[placeholder="Name..."]', { timeout: 15000 }).type(staffName + '{enter}');
    cy.contains(staffName, { timeout: 20000 }).should('be.visible');
  });
});
