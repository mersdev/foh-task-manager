import { nav, openAdminFromSettings } from './helpers';

describe('Task management', () => {
  it('adds a task successfully', () => {
    const taskName = 'Cypress Task ' + Date.now();

    openAdminFromSettings();
    nav('Tasks');

    cy.get('input[placeholder="Task name..."]', { timeout: 15000 }).type(taskName);
    cy.get('select').first().find('option').eq(0).then((opt) => {
      cy.get('select').first().select(String(opt.val()));
    });
    cy.get('select').eq(1).find('option').eq(0).then((opt) => {
      cy.get('select').eq(1).select(String(opt.val()));
    });

    cy.contains('button', 'Add Task').click();
    cy.contains(taskName, { timeout: 20000 }).should('be.visible');
  });
});
