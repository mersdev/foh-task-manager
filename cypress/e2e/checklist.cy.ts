import { nav, openAdminFromSettings } from './helpers';

describe('Checklist completion flow', () => {
  it('completes and unticks a checklist task', () => {
    openAdminFromSettings();
    nav('Checklist');
    cy.contains('p', 'Check Coffee Machine', { timeout: 20000 })
      .parents('div.rounded-2xl')
      .first()
      .find('button')
      .first()
      .click({ force: true });

    cy.contains('h3', 'Who completed this?', { timeout: 10000 }).should('be.visible');
    cy.contains('button', 'Justin').click();

    cy.contains('p', 'Check Coffee Machine', { timeout: 20000 })
      .parents('div.rounded-2xl')
      .first()
      .find('button')
      .first()
      .click({ force: true });
    cy.contains('h3', 'Who completed this?').should('not.exist');
  });
});
