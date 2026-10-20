import { Injectable } from '@nestjs/common';
import { IWallet, ITransactionRecord } from '../entities/wallet.entity';

@Injectable()
export class WalletStore {
  private readonly wallets = new Map<string, IWallet>();
  private readonly transactions = new Map<string, ITransactionRecord[]>();

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData(): void {
    // Seed ví mẫu cho Alice và Bob phục vụ demo và test
    const aliceWallet: IWallet = {
      id: 'wal_alice_usd',
      userId: 'usr_alice',
      balance: 1000,
      currency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const bobWallet: IWallet = {
      id: 'wal_bob_usd',
      userId: 'usr_bob',
      balance: 200,
      currency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.wallets.set(aliceWallet.id, aliceWallet);
    this.wallets.set(bobWallet.id, bobWallet);
    this.transactions.set(aliceWallet.id, []);
    this.transactions.set(bobWallet.id, []);
  }

  getWallet(id: string): IWallet | undefined {
    return this.wallets.get(id);
  }

  findWalletsByUserId(userId: string): IWallet[] {
    return Array.from(this.wallets.values()).filter((w) => w.userId === userId);
  }

  createWallet(wallet: IWallet): IWallet {
    this.wallets.set(wallet.id, { ...wallet });
    if (!this.transactions.has(wallet.id)) {
      this.transactions.set(wallet.id, []);
    }
    return wallet;
  }

  updateBalance(id: string, newBalance: number): IWallet {
    const wallet = this.wallets.get(id);
    if (!wallet) {
      throw new Error(`Wallet ${id} not found`);
    }
    wallet.balance = newBalance;
    wallet.updatedAt = new Date();
    this.wallets.set(id, wallet);
    return wallet;
  }

  addTransaction(walletId: string, tx: ITransactionRecord): void {
    const list = this.transactions.get(walletId) || [];
    list.push(tx);
    this.transactions.set(walletId, list);
  }

  getTransactions(walletId: string): ITransactionRecord[] {
    return this.transactions.get(walletId) || [];
  }

  resetForTesting(): void {
    this.wallets.clear();
    this.transactions.clear();
    this.seedInitialData();
  }
}
