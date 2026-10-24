/** Live usage is reserved atomically and settled once; missing usage retains the reservation. */
export interface BudgetLease<Usage = void> {
  settle(usage: Usage): void;
}
export interface BudgetLedger<Reservation, Usage = void> {
  reserve(input: Reservation): BudgetLease<Usage>;
}
