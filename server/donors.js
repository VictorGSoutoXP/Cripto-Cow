import { z } from 'zod';

const name = z.string().trim().min(2).max(60);

export const donorSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('anonymous') }).strict(),
    z.object({ type: z.literal('person'), name }).strict(),
    z.object({ type: z.literal('company'), name }).strict(),
  ])
  .default({ type: 'anonymous' });

export function publicDonation(donation) {
  return {
    id: donation.id,
    ledgerId: donation.ledgerId,
    donor: donorSchema.parse(donation.donor),
    simulated: true,
  };
}
