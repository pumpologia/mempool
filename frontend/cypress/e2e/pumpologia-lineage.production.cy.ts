const CLOSE_TX = '31767c44961d59cf14e0810f49734e814363ba8bee834e54f779b16aae995167';
const OPEN_TX = '8780cae26251499cda1f71b1cb63e17c4157d5ead240fe1409e98121e22a36c9';

describe('Pumpologia transaction lineage', () => {
  const visitClose = (): void => {
    cy.visit(`/fr/tx/${CLOSE_TX}`);
    cy.contains('Transaction lineage', { timeout: 30_000 }).should('be.visible');
  };

  it('links a close transaction back to its opening UTXO on desktop', () => {
    cy.viewport(1440, 1000);
    visitClose();

    cy.get('.position-route .open-node')
      .should('have.attr', 'href')
      .and('include', OPEN_TX);
    cy.get('.position-route .close-node.current').should('exist');
    cy.get('.input-node.protocol-node').should('have.length.at.least', 1);
    cy.get('.operation-pnl').should('contain.text', '$231.47');
  });

  it('keeps the lineage in a vertical reading order on mobile', () => {
    cy.viewport(390, 844);
    visitClose();

    cy.get('.branch-lines').should('not.be.visible');
    cy.get('.operation-node').should('be.visible');
    cy.get('.input-node.protocol-node').should('be.visible');
    cy.document().then(document => {
      expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth + 1);
    });
  });
});
