/** Both ledgers reserve atomically and settle once; missing usage never refunds a reservation. */
export interface BudgetLease<Usage = void> {
  settle(usage: Usage): void;
}
export interface BudgetLedger<Reservation, Usage = void> {
  reserve(input: Reservation): BudgetLease<Usage>;
}
