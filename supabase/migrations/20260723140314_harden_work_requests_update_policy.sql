BEGIN;

DROP POLICY IF EXISTS work_requests_update ON public.work_requests;

CREATE POLICY work_requests_update ON public.work_requests
    FOR UPDATE TO authenticated
    USING (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    )
    WITH CHECK (
        farm_id = (SELECT farm_id FROM public.profiles WHERE id = auth.uid())
    );

COMMIT;
