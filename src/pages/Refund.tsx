import LegalPolicyPage from "@/components/LegalPolicyPage";

export default function Refund({ withBottomNav = false }: { withBottomNav?: boolean }) {
    return (
        <LegalPolicyPage title="Refund Policy" policyTitle="AcreLedger Refund Policy" withBottomNav={withBottomNav}>
            <p>{"Last updated: November 1, 2026"}</p>
            <p>{"AcreLedger is provided by Egbert Farms, LLC (\"we\")."}</p>
            <h2 className="text-lg font-bold text-foreground pt-4">{"Try it free first"}</h2>
            <p>{"Every new farm gets 3 months free with no card. Use the trial to see if AcreLedger fits your operation before you pay."}</p>
            <h2 className="text-lg font-bold text-foreground pt-4">{"Cancelling"}</h2>
            <ul className="list-disc space-y-3 pl-5"><li><strong>{"Renewal reminder:"}</strong>{" We'll email you a renewal reminder 14 to 30 days before each yearly charge, with the charge date, the amount, and how to cancel."}</li><li>{"You can cancel any time in "}<strong>{"Settings → Billing"}</strong>{". You won't be charged again."}</li><li>{"Your farm keeps working fully until the end of the year you've paid for. After that it becomes read-only. You can always view and export your data. We don't delete it."}</li></ul>
            <h2 className="text-lg font-bold text-foreground pt-4">{"Refunds"}</h2>
            <ul className="list-disc space-y-3 pl-5"><li><strong>{"30-day full refund:"}</strong>{" if you ask within 30 days of any charge (your first payment or a yearly renewal), we refund that charge in full."}</li><li><strong>{"After 30 days:"}</strong>{" no refund for that charge. You keep full access until the end of the paid year, then the farm goes read-only."}</li><li><strong>{"Always refunded, at any time:"}</strong>{" duplicate charges, charges made after you cancelled, and billing errors on our side."}</li></ul>
            <h2 className="text-lg font-bold text-foreground pt-4">{"Failed payments"}</h2>
            <p>{"If a renewal payment fails, you have 14 days to update your card before the farm goes read-only. There are no late fees."}</p>
            <h2 className="text-lg font-bold text-foreground pt-4">{"Australian customers"}</h2>
            <p>{"Nothing in this policy limits your rights under the Australian Consumer Law. If the service has a major failure, you may be entitled to a refund or other remedy regardless of the 30-day rule above."}</p>
            <h2 className="text-lg font-bold text-foreground pt-4">{"How to ask"}</h2>
            <p>{"Email "}<strong><a href="mailto:acreledgerapp@gmail.com" className="underline">acreledgerapp@gmail.com</a></strong>{" with your farm name and the email address on your account. Approved refunds go back to the original card through Stripe and usually take 5–10 business days to show."}</p>
        </LegalPolicyPage>
    );
}
