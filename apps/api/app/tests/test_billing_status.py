from __future__ import annotations

from app.models import OrganizationSubscription, SubscriptionPlanEnum, SubscriptionStatusEnum
from app.routers.billing import _status_from_stripe
from app.services.billing import effective_plan


def _plan_for(stripe_status: str) -> SubscriptionPlanEnum:
    subscription = OrganizationSubscription(plan=SubscriptionPlanEnum.PRO, status=_status_from_stripe(stripe_status), stripe_subscription_id="sub_1")
    return effective_plan(subscription)[0]


def test_plan_stays_while_stripe_retries_and_drops_to_free_when_unpaid():
    assert _plan_for("active") == SubscriptionPlanEnum.PRO
    # A failed renewal: Stripe retries the card for a while; the business keeps working meanwhile.
    assert _status_from_stripe("past_due") == SubscriptionStatusEnum.PAST_DUE
    assert _plan_for("past_due") == SubscriptionPlanEnum.PRO
    # Retries ran out, the subscription was cancelled, or the first payment never happened: Free.
    for status in ("unpaid", "canceled", "incomplete", "incomplete_expired"):
        assert _plan_for(status) == SubscriptionPlanEnum.FREE, status
