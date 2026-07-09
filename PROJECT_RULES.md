# AccelProjects Learning Project

Goal:
Build a simple customer order app that teaches API integration one feature at a time.

Rules:
1. Build one integration at a time.
2. Do not use live payments until sandbox tests pass.
3. Do not store API keys in frontend code.
4. Every outside action must create a log record.
5. Every module must have a manual test button.
6. Payment, email, and SMS should each work independently before being combined.
7. Use test customer data only until the full workflow is stable.

Core entities:
- Customer
- Order
- Payment
- EmailLog
- SmsLog
- WebhookEvent