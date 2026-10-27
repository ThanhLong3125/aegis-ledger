import { Module } from '@nestjs/common';
import { DatabaseModule } from '@aegis/database';
import { ChainVerifierService } from './services/chain-verifier.service';
import { MerkleProverService } from './services/merkle-prover.service';
import { ProofVerifierService } from './services/proof-verifier.service';

@Module({
  imports: [DatabaseModule],
  providers: [ChainVerifierService, MerkleProverService, ProofVerifierService],
  exports: [ChainVerifierService, MerkleProverService, ProofVerifierService],
})
export class CliModule {}
