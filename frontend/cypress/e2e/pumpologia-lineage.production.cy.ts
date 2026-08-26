const CLOSE_TX = '31767c44961d59cf14e0810f49734e814363ba8bee834e54f779b16aae995167';
const OPEN_TX = '8780cae26251499cda1f71b1cb63e17c4157d5ead240fe1409e98121e22a36c9';
const POSITION_ID = `${OPEN_TX}:1`;
const CLASSIC_TX = '377ef78734d394d573199cf2e874156a8521debd3b3409619699bb7b2141e1d8';

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
    cy.get('tx-bowtie-graph').should('not.exist');
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

  it('uses the classic flow only when no Pumpologia lineage exists', () => {
    cy.viewport(1440, 1000);
    cy.visit(`/fr/tx/${CLASSIC_TX}`);

    cy.get('tx-bowtie-graph', { timeout: 30_000 }).should('be.visible');
    cy.contains('Transaction lineage').should('not.exist');
    cy.get('.pumpologia-context').should('not.exist');
  });

  it('opens a position directly on its trading data', () => {
    cy.viewport(1440, 1000);
    cy.visit(`/fr/protocol/position/${POSITION_ID}`);

    cy.get('.position-header', { timeout: 30_000 }).should('be.visible');
    cy.contains('Back to activity').should('not.exist');
    cy.contains('Position overview').should('not.exist');
    cy.contains('A focused view of exposure').should('not.exist');
  });
});
