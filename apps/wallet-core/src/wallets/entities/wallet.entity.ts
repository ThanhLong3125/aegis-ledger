export interface IWallet {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITransactionRecord {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW' | 'TRANSFER';
  amount: number;
  currency: string;
  fromWalletId?: string;
  toWalletId?: string;
  balanceBefore: number;
  balanceAfter: number;
  timestamp: Date;
}
