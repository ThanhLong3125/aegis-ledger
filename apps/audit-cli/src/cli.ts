import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { CliModule } from './cli.module';
import { ChainVerifierService } from './services/chain-verifier.service';
import { MerkleProverService } from './services/merkle-prover.service';
import { ProofVerifierService } from './services/proof-verifier.service';
import {
  handleVerifyChainCommand,
  handleProveCommand,
  handleVerifyProofCommand,
} from './commands';

async function bootstrap() {
  const program = new Command();

  program
    .name('aegis-cli')
    .description('🛡️ Aegis Ledger Independent Zero-Trust Auditor CLI')
    .version('1.0.0');

  // Lệnh 1: verify (Quét toàn bộ chuỗi)
  program
    .command('verify')
    .alias('verify-chain')
    .description('Quét toàn bộ chuỗi Epoch và kiểm tra tính toàn vẹn mật mã học')
    .action(async () => {
      const app = await NestFactory.createApplicationContext(CliModule, {
        logger: false,
      });
      const chainVerifier = app.get(ChainVerifierService);
      const exitCode = await handleVerifyChainCommand(chainVerifier);
      await app.close();
      process.exit(exitCode);
    });

  // Lệnh 2: prove (Xuất bằng chứng Merkle Proof O(log N))
  program
    .command('prove')
    .description('Xuất bằng chứng thành viên Merkle Proof O(log N) cho một giao dịch')
    .requiredOption('-s, --seq <number>', 'Mã Sequence number của giao dịch cần chứng minh')
    .option('-o, --out <path>', 'Đường dẫn file JSON xuất ra để gửi cho bên thứ ba')
    .action(async (options) => {
      const app = await NestFactory.createApplicationContext(CliModule, {
        logger: false,
      });
      const merkleProver = app.get(MerkleProverService);
      const exitCode = await handleProveCommand(merkleProver, options);
      await app.close();
      process.exit(exitCode);
    });

  // Lệnh 3: verify-proof (Xác minh bằng chứng độc lập không cần DB)
  program
    .command('verify-proof')
    .description('Xác minh độc lập bằng chứng Merkle Proof ngoại tuyến (Offline Zero-Trust)')
    .option('-f, --file <path>', 'Đường dẫn tới file JSON chứa bằng chứng MerkleProofDto')
    .option('-l, --leaf <hash>', 'Mã SHA-256 hash của lá giao dịch')
    .option('-r, --root <hash>', 'Mã Merkle Root của khối Epoch')
    .option('-p, --proof <json_or_file>', 'Chuỗi JSON hoặc file chứa mảng proof steps')
    .action(async (options) => {
      const proofVerifier = new ProofVerifierService();
      const exitCode = await handleVerifyProofCommand(proofVerifier, options);
      process.exit(exitCode);
    });

  await program.parseAsync(process.argv);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}
