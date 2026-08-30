# T04-04 — Communications UI (thread view)
Status: TODO
Owner: worker-code
Spec: specs/04-communications.md
Depends: T04-02
# Goal: Replace Communications sidebar placeholder in App.tsx with real thread view. Add client/src/pages/Communications.tsx — list threads attached to booking, view/post messages (gated by operations.*). Add Route /communications and routeScope mapping. Wire to tRPC listMessages/sendMessage if router exists, else local state with follow-up note like T02-05. Add client/src/pages/Communications.contract.test.ts. Ensure pnpm test/check/build pass.
