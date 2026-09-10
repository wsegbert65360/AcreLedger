import { supabase } from '@/lib/supabase';

export async function requestAccountDeletion(
  userId: string,
  farmId: string,
): Promise<'requested' | 'already_pending'> {
  const { error } = await supabase
    .from('account_deletion_requests')
    .insert({ user_id: userId, farm_id: farmId });

  if (!error) return 'requested';

  // The user_id uniqueness constraint makes repeated taps idempotent without
  // giving clients update rights over deletion workflow state.
  if (error.code === '23505') return 'already_pending';
  throw error;
}
