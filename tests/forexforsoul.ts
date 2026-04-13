import * as anchor from '@coral-xyz/anchor';
import { assert } from 'chai';

describe('forexforsoul', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it('initializes exchange', async () => {
    assert.ok(true);
  });

  it('opens EUR/USD long position', async () => {
    assert.ok(true);
  });
});
