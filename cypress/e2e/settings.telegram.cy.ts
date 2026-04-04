import { nav, openAdminFromSettings } from './helpers';

describe('Settings: Telegram and system settings', () => {
  const addSettingsItem = (sectionTitle: string, itemName: string) => {
    cy.contains('h2', sectionTitle)
      .closest('div.space-y-4')
      .within(() => {
        cy.get('input').first().type(itemName);
        cy.get('button').first().click();
      });

    cy.contains('h2', sectionTitle)
      .closest('div.space-y-4')
      .contains(itemName, { timeout: 20000 })
      .should('be.visible');
  };

  it('uses Telegram-only communication and updates settings', () => {
    const suffix = Date.now();
    openAdminFromSettings();

    cy.contains('h2', 'Telegram Notifications', { timeout: 15000 }).should('be.visible');
    cy.contains('Shift closing sends a Telegram Bot API message.').should('be.visible');
    cy.contains('h2', 'Notification Emails').should('not.exist');

    cy.contains('h2', 'Regional Settings').should('be.visible');
    cy.get('select').first().select('Asia/Singapore').should('have.value', 'Asia/Singapore');
    cy.get('select').first().select('UTC').should('have.value', 'UTC');

    addSettingsItem('Categories', 'Cypress Category ' + suffix);
    addSettingsItem('Time Slots', 'Cypress Slot ' + suffix);

    nav('Settings');
    cy.contains('h2', 'Security').should('be.visible');
    cy.contains('button', 'Update PIN').should('be.visible');
  });
});
