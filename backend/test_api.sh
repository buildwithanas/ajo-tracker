#!/bin/bash
set -e
BASE="http://localhost:4000/api"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local condition="$2"
  if [ "$condition" = "true" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL+1))
  fi
}

echo "=== 1. Health check ==="
HEALTH=$(curl -s $BASE/health)
echo "$HEALTH"
check "health endpoint returns ok" "$(echo $HEALTH | jq -r '.status == "ok"')"

echo ""
echo "=== 2. Register 3 users ==="
REG_A=$(curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" -d '{"full_name":"Amaka Okafor","email":"amaka@example.com","password":"password123","phone":"08011111111"}')
TOKEN_A=$(echo $REG_A | jq -r '.token')
USER_A_ID=$(echo $REG_A | jq -r '.user.id')
check "user A registered with token" "$([ "$TOKEN_A" != "null" ] && echo true || echo false)"

REG_B=$(curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" -d '{"full_name":"Bode Adewale","email":"bode@example.com","password":"password123","phone":"08022222222"}')
TOKEN_B=$(echo $REG_B | jq -r '.token')
check "user B registered with token" "$([ "$TOKEN_B" != "null" ] && echo true || echo false)"

REG_C=$(curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" -d '{"full_name":"Chiamaka Eze","email":"chiamaka@example.com","password":"password123","phone":"08033333333"}')
TOKEN_C=$(echo $REG_C | jq -r '.token')
check "user C registered with token" "$([ "$TOKEN_C" != "null" ] && echo true || echo false)"

echo ""
echo "=== 3. Duplicate email should fail ==="
DUP=$(curl -s -w "\n%{http_code}" -X POST $BASE/auth/register -H "Content-Type: application/json" -d '{"full_name":"Fake Amaka","email":"amaka@example.com","password":"password123"}')
DUP_CODE=$(echo "$DUP" | tail -1)
check "duplicate registration rejected with 409" "$([ "$DUP_CODE" = "409" ] && echo true || echo false)"

echo ""
echo "=== 4. Login with wrong password should fail ==="
BADLOGIN=$(curl -s -w "\n%{http_code}" -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"email":"amaka@example.com","password":"wrongpass"}')
BADLOGIN_CODE=$(echo "$BADLOGIN" | tail -1)
check "wrong password rejected with 401" "$([ "$BADLOGIN_CODE" = "401" ] && echo true || echo false)"

echo ""
echo "=== 5. Login correctly as A ==="
LOGIN_A=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" -d '{"email":"amaka@example.com","password":"password123"}')
TOKEN_A=$(echo $LOGIN_A | jq -r '.token')
check "login returns fresh token" "$([ "$TOKEN_A" != "null" ] && echo true || echo false)"

echo ""
echo "=== 6. Create group as A (admin) ==="
GROUP=$(curl -s -X POST $BASE/groups -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_A" -d '{"name":"Agege Market Women Ajo","description":"Monthly rotating savings for the shop owners","contribution_amount":20000,"currency":"NGN","frequency":"monthly","group_type":"rotating"}')
echo "$GROUP"
GROUP_ID=$(echo $GROUP | jq -r '.group.id')
INVITE_CODE=$(echo $GROUP | jq -r '.group.invite_code')
check "group created with id and invite code" "$([ "$GROUP_ID" != "null" ] && [ "$INVITE_CODE" != "null" ] && echo true || echo false)"

echo ""
echo "=== 7. B and C join using invite code ==="
JOIN_B=$(curl -s -w "\n%{http_code}" -X POST $BASE/groups/join -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_B" -d "{\"invite_code\":\"$INVITE_CODE\"}")
JOIN_B_CODE=$(echo "$JOIN_B" | tail -1)
check "user B joined group (201)" "$([ "$JOIN_B_CODE" = "201" ] && echo true || echo false)"

JOIN_C=$(curl -s -w "\n%{http_code}" -X POST $BASE/groups/join -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_C" -d "{\"invite_code\":\"$INVITE_CODE\"}")
JOIN_C_CODE=$(echo "$JOIN_C" | tail -1)
check "user C joined group (201)" "$([ "$JOIN_C_CODE" = "201" ] && echo true || echo false)"

echo ""
echo "=== 8. Duplicate join should fail ==="
JOIN_B_AGAIN=$(curl -s -w "\n%{http_code}" -X POST $BASE/groups/join -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_B" -d "{\"invite_code\":\"$INVITE_CODE\"}")
JOIN_B_AGAIN_CODE=$(echo "$JOIN_B_AGAIN" | tail -1)
check "duplicate join rejected with 409" "$([ "$JOIN_B_AGAIN_CODE" = "409" ] && echo true || echo false)"

echo ""
echo "=== 9. Invalid invite code should fail ==="
BADJOIN=$(curl -s -w "\n%{http_code}" -X POST $BASE/groups/join -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_C" -d '{"invite_code":"NOTREAL"}')
BADJOIN_CODE=$(echo "$BADJOIN" | tail -1)
check "invalid invite code rejected with 404" "$([ "$BADJOIN_CODE" = "404" ] && echo true || echo false)"

echo ""
echo "=== 10. List members ==="
MEMBERS=$(curl -s $BASE/groups/$GROUP_ID/members -H "Authorization: Bearer $TOKEN_A")
MEMBER_COUNT=$(echo $MEMBERS | jq '.members | length')
check "group has 3 members" "$([ "$MEMBER_COUNT" = "3" ] && echo true || echo false)"
MEMBER_B_ID=$(echo $MEMBERS | jq -r '.members[] | select(.full_name=="Bode Adewale") | .member_id')
MEMBER_C_ID=$(echo $MEMBERS | jq -r '.members[] | select(.full_name=="Chiamaka Eze") | .member_id')

echo ""
echo "=== 11. Non-member cannot access group ==="
REG_D=$(curl -s -X POST $BASE/auth/register -H "Content-Type: application/json" -d '{"full_name":"Dele Outsider","email":"dele@example.com","password":"password123"}')
TOKEN_D=$(echo $REG_D | jq -r '.token')
OUTSIDER=$(curl -s -w "\n%{http_code}" $BASE/groups/$GROUP_ID -H "Authorization: Bearer $TOKEN_D")
OUTSIDER_CODE=$(echo "$OUTSIDER" | tail -1)
check "non-member blocked with 403" "$([ "$OUTSIDER_CODE" = "403" ] && echo true || echo false)"

echo ""
echo "=== 12. Non-admin cannot create a cycle ==="
NONADMIN_CYCLE=$(curl -s -w "\n%{http_code}" -X POST $BASE/groups/$GROUP_ID/cycles -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_B" -d '{"due_date":"2026-10-01"}')
NONADMIN_CYCLE_CODE=$(echo "$NONADMIN_CYCLE" | tail -1)
check "non-admin blocked from creating cycle (403)" "$([ "$NONADMIN_CYCLE_CODE" = "403" ] && echo true || echo false)"

echo ""
echo "=== 13. Admin creates cycle 1 ==="
CYCLE1=$(curl -s -X POST $BASE/groups/$GROUP_ID/cycles -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_A" -d '{"due_date":"2026-10-01"}')
echo "$CYCLE1"
CYCLE1_ID=$(echo $CYCLE1 | jq -r '.cycle.id')
CYCLE1_RECIPIENT=$(echo $CYCLE1 | jq -r '.cycle.recipient_member_id')
check "cycle 1 created" "$([ "$CYCLE1_ID" != "null" ] && echo true || echo false)"
check "cycle 1 auto-assigned a recipient (rotating group)" "$([ "$CYCLE1_RECIPIENT" != "null" ] && echo true || echo false)"

echo ""
echo "=== 14. Contributions auto-created for all 3 members ==="
CONTRIBS=$(curl -s "$BASE/groups/$GROUP_ID/contributions?cycle_id=$CYCLE1_ID" -H "Authorization: Bearer $TOKEN_A")
CONTRIB_COUNT=$(echo $CONTRIBS | jq '.contributions | length')
check "3 pending contributions created for cycle 1" "$([ "$CONTRIB_COUNT" = "3" ] && echo true || echo false)"

CONTRIB_B_ID=$(echo $CONTRIBS | jq -r ".contributions[] | select(.member_id==$MEMBER_B_ID) | .id")
CONTRIB_C_ID=$(echo $CONTRIBS | jq -r ".contributions[] | select(.member_id==$MEMBER_C_ID) | .id")

echo ""
echo "=== 15. B pays their own contribution ==="
PAY_B=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/groups/$GROUP_ID/contributions/$CONTRIB_B_ID/pay -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_B" -d '{"note":"Paid via bank transfer"}')
PAY_B_CODE=$(echo "$PAY_B" | tail -1)
check "B successfully pays own contribution" "$([ "$PAY_B_CODE" = "200" ] && echo true || echo false)"

echo ""
echo "=== 16. B cannot pay C's contribution ==="
PAY_C_AS_B=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/groups/$GROUP_ID/contributions/$CONTRIB_C_ID/pay -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_B" -d '{}')
PAY_C_AS_B_CODE=$(echo "$PAY_C_AS_B" | tail -1)
check "B blocked from paying C's contribution (403)" "$([ "$PAY_C_AS_B_CODE" = "403" ] && echo true || echo false)"

echo ""
echo "=== 17. Admin (A) can mark C's contribution paid on their behalf ==="
PAY_C_AS_A=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/groups/$GROUP_ID/contributions/$CONTRIB_C_ID/pay -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_A" -d '{"note":"Paid cash, confirmed by admin"}')
PAY_C_AS_A_CODE=$(echo "$PAY_C_AS_A" | tail -1)
check "admin marks C's contribution paid (200)" "$([ "$PAY_C_AS_A_CODE" = "200" ] && echo true || echo false)"

echo ""
echo "=== 18. Paying an already-paid contribution fails ==="
PAY_B_AGAIN=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/groups/$GROUP_ID/contributions/$CONTRIB_B_ID/pay -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_B" -d '{}')
PAY_B_AGAIN_CODE=$(echo "$PAY_B_AGAIN" | tail -1)
check "double-pay rejected with 409" "$([ "$PAY_B_AGAIN_CODE" = "409" ] && echo true || echo false)"

echo ""
echo "=== 19. Dashboard reflects 2 paid, 1 pending ==="
DASH=$(curl -s $BASE/groups/$GROUP_ID/dashboard -H "Authorization: Bearer $TOKEN_A")
echo "$DASH" | jq '.totals'
TOTAL_COLLECTED=$(echo $DASH | jq -r '.totals.total_collected')
PENDING_COUNT=$(echo $DASH | jq -r '.totals.pending_count')
check "total_collected = 40000.00 (2 members paid 20000 each)" "$([ "$TOTAL_COLLECTED" = "40000.00" ] && echo true || echo false)"
check "pending_count = 1 (A has not paid yet)" "$([ "$PENDING_COUNT" = "1" ] && echo true || echo false)"

echo ""
echo "=== 20. Close cycle 1, verify recipient flagged as paid out ==="
CLOSE1=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/groups/$GROUP_ID/cycles/$CYCLE1_ID/close -H "Authorization: Bearer $TOKEN_A")
CLOSE1_CODE=$(echo "$CLOSE1" | tail -1)
check "cycle 1 closed successfully (200)" "$([ "$CLOSE1_CODE" = "200" ] && echo true || echo false)"

MEMBERS_AFTER=$(curl -s $BASE/groups/$GROUP_ID/members -H "Authorization: Bearer $TOKEN_A")
RECEIVED_COUNT=$(echo $MEMBERS_AFTER | jq '[.members[] | select(.has_received_payout==true)] | length')
check "exactly 1 member flagged has_received_payout after closing cycle 1" "$([ "$RECEIVED_COUNT" = "1" ] && echo true || echo false)"

echo ""
echo "=== 21. Create cycle 2, verify it rotates to a NEW recipient ==="
CYCLE2=$(curl -s -X POST $BASE/groups/$GROUP_ID/cycles -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_A" -d '{"due_date":"2026-11-01"}')
CYCLE2_RECIPIENT=$(echo $CYCLE2 | jq -r '.cycle.recipient_member_id')
check "cycle 2 recipient differs from cycle 1 recipient" "$([ "$CYCLE2_RECIPIENT" != "$CYCLE1_RECIPIENT" ] && echo true || echo false)"
check "cycle 2 has cycle_number 2" "$([ "$(echo $CYCLE2 | jq -r '.cycle.cycle_number')" = "2" ] && echo true || echo false)"

echo ""
echo "=== 22. Missing auth token rejected ==="
NOAUTH=$(curl -s -w "\n%{http_code}" $BASE/groups)
NOAUTH_CODE=$(echo "$NOAUTH" | tail -1)
check "request without token rejected with 401" "$([ "$NOAUTH_CODE" = "401" ] && echo true || echo false)"

echo ""
echo "=== 23. List my groups for A shows 1 group ==="
MYGROUPS=$(curl -s $BASE/groups -H "Authorization: Bearer $TOKEN_A")
MYGROUPS_COUNT=$(echo $MYGROUPS | jq '.groups | length')
check "A's group list has 1 group" "$([ "$MYGROUPS_COUNT" = "1" ] && echo true || echo false)"

echo ""
echo "================================"
echo "RESULTS: $PASS passed, $FAIL failed"
echo "================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
