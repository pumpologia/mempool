const EVENT_BLOCK = 964049;

const expectNoHorizontalOverflow = (): void => {
  cy.document().then(document => {
    expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth + 1);
  });
};

describe('Pumpologia primary surfaces', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
  });

  it('keeps the terminal and market tape readable on mobile', () => {
    cy.visit('/fr/');
    cy.contains('Trade', { timeout: 30_000 }).should('be.visible');
    cy.contains('Bitcoin market tape', { timeout: 30_000 }).should('be.visible');
    expectNoHorizontalOverflow();
  });

  it('hydrates inherited explorer tools progressively', () => {
    cy.visit('/fr/');
    cy.contains('Bitcoin market tape', { timeout: 30_000 }).should('be.visible');
    cy.get('.dashboard-deferred-placeholder').should('exist').then($placeholder => {
      $placeholder[0].scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    cy.get('app-fees-box', { timeout: 30_000 }).should('exist');
  });

  it('loads the protocol summary and paginated activity without overlap', () => {
    cy.visit('/fr/protocol');
    cy.contains('Open interest', { timeout: 30_000 }).should('be.visible');
    cy.contains('Recent activity', { timeout: 30_000 }).should('be.visible');
    cy.get('.protocol-alert').should('not.exist');
    cy.get('.activity-card').should('have.length.at.least', 1);
    expectNoHorizontalOverflow();
  });

  it('shows only the bounded Pumpologia tape on an event block', () => {
    cy.visit(`/fr/block/${EVENT_BLOCK}`);
    cy.contains('Activity indexed in this block', { timeout: 30_000 }).should('be.visible');
    cy.get('.context-operations article', { timeout: 30_000 }).should('have.length.at.least', 1).and('have.length.at.most', 6);
    cy.contains(/transactions$/i).should('not.exist');
    expectNoHorizontalOverflow();
  });

  it('keeps activity usable when the summary request fails', () => {
    cy.intercept('GET', '**/api/pumpologia/v1/summary', { forceNetworkError: true });
    cy.visit('/fr/protocol');
    cy.contains('Market totals are temporarily unavailable', { timeout: 30_000 }).should('be.visible');
    cy.get('.activity-card', { timeout: 30_000 }).should('have.length.at.least', 1);
    cy.contains('Loading Pumpologia market state').should('not.exist');
  });

  it('never presents an indexer failure as an empty block', () => {
    cy.intercept('GET', `**/api/pumpologia/v1/operations?*block_height=${EVENT_BLOCK}*`, {
      statusCode: 503,
      body: {},
    });
    cy.visit(`/fr/block/${EVENT_BLOCK}`);
    cy.contains('Protocol events are temporarily unavailable', { timeout: 30_000 }).should('be.visible');
    cy.contains('No Pumpologia events in this block').should('not.exist');
  });

  it('keeps the block carousel stable when market overlays are unavailable', () => {
    cy.intercept('GET', '**/api/pumpologia/v1/block-market?*', {
      statusCode: 502,
      body: {},
    });
    cy.visit('/fr/');
    cy.contains('Bitcoin market tape', { timeout: 30_000 }).should('be.visible');
    cy.get('a.blockLink[aria-label]').should('have.length.at.least', 1);
    expectNoHorizontalOverflow();
  });
});
