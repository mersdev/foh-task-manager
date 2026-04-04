export const openAdminFromSettings = () => {
  cy.visit('/');
  cy.contains('button', 'Settings', { timeout: 30000 }).click();
  cy.contains('button', 'ADMIN OFF', { timeout: 20000 }).click();
  cy.get('input[type="password"]').first().type('5897');
  cy.contains('button', 'Enter').click();
  cy.contains('button', 'ADMIN ON', { timeout: 15000 }).should('be.visible');
};

export const nav = (label: 'Checklist' | 'Temps' | 'Tasks' | 'Staff' | 'Logs' | 'Settings') => {
  cy.contains('button', label, { timeout: 15000 }).click();
};
