"""Starts the FWSlot game server.
Usage:  python server/run.py [--host 127.0.0.1] [--port 8765] [--data server/data] [--admin-password SECRET] [--no-gamble] [--no-rewards]
        [--wallet off|mock|ton] [--ton-address ADDRESS] [--ton-network mainnet|testnet] [--ton-api-key KEY]

Real money (TON): --wallet mock simulates deposits for development (admin cabinet button); --wallet ton reads the incoming transfers
of --ton-address from TON Center (a key is optional). The server holds NO private key and sends nothing: an admin pays withdrawals from
the operator's own wallet and records the hash in the cabinet. Real play also needs a licence, KYC / AML and responsible-gambling tools.

Data folder: state.json (accounts, balances), journal.jsonl (every round and admin action), admin_password.txt
(written ONCE when the admin credential is first generated). Admin panel: http://HOST:PORT/admin  (user: admin).
Bind to 127.0.0.1 only; for a real deployment put the server behind HTTPS (the password travels in the request).
"""
import argparse
import os
import threading
import time
from pathlib import Path

from fwslot_server.game import GameService
from fwslot_server.http_api import make_server
from fwslot_server.journal import Journal
from fwslot_server.store import Store
from fwslot_server.wallet import WalletConfig
from fwslot_server import ton


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    env = os.environ.get
    ap.add_argument("--host", default=env("FWSLOT_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(env("FWSLOT_PORT", "8765")))
    ap.add_argument("--data", type=Path, default=Path(env("FWSLOT_DATA") or Path(__file__).resolve().parent / "data"))
    ap.add_argument("--trust-proxy", action="store_true", default=env("FWSLOT_TRUST_PROXY") == "1",
                    help="the server sits behind a reverse proxy (a host's HTTPS front): count players by the address the proxy reports, not by the proxy itself")
    ap.add_argument("--web-dir", type=Path, default=Path(env("FWSLOT_WEB") or Path(__file__).resolve().parent / "web"), help="folder with the browser build of the game (served at /play/)")
    ap.add_argument("--admin-password", default=os.environ.get("FWSLOT_ADMIN_PASSWORD"))
    ap.add_argument("--no-gamble", action="store_true", help="switch the double-up (guess the van) game off (operator flag)")
    ap.add_argument("--no-rewards", action="store_true", help="no free spins for ranks and win streaks (ranks and counters still run)")
    ap.add_argument("--wallet", choices=["off", "mock", "ton"], default=env("FWSLOT_WALLET", "off"), help="real-money TON wallet: off | mock (development) | ton (TON Center)")
    ap.add_argument("--ton-address", default=os.environ.get("FWSLOT_TON_ADDRESS", ""), help="the operator's deposit address")
    ap.add_argument("--ton-network", choices=["mainnet", "testnet"], default=env("FWSLOT_TON_NETWORK", "mainnet"))
    ap.add_argument("--ton-api-key", default=os.environ.get("FWSLOT_TON_API_KEY"))
    ap.add_argument("--ton-api-url", default=env("FWSLOT_TON_API_URL", "https://toncenter.com"), help="TON Center compatible endpoint (use the testnet one with --ton-network testnet)")
    ap.add_argument("--max-real-bet", type=int, default=1000, help="highest bet in real mode, in cents of TON (default 10.00)")
    ap.add_argument("--wager-mult", type=float, default=1.0, help="a player must wager this x his deposits before he can withdraw (default 1.0; 0 = off)")
    ap.add_argument("--server-created-wallets", action="store_true",
                    help="also let the server create players' wallets (the recovery words then cross the network; off by default: the client makes them)")
    args = ap.parse_args()
    store = Store(args.data / "state.json")
    journal = Journal(args.data / "journal.jsonl")
    wallet = WalletConfig(enabled=args.wallet != "off", provider="mock" if args.wallet == "mock" else "toncenter", network=args.ton_network,
                          address=args.ton_address, max_bet_cents=args.max_real_bet, wager_mult=args.wager_mult,
                          server_create=args.server_created_wallets)
    provider = None
    if wallet.enabled:
        if not wallet.address:
            raise SystemExit("--wallet needs --ton-address (the operator's deposit address)")
        if args.wallet == "mock":
            provider = ton.MockTon()
        else:
            test_api = "testnet" in args.ton_api_url
            if (args.ton_network == "testnet") != test_api:
                raise SystemExit("--ton-network and --ton-api-url must point at the same network")
            provider = ton.ToncenterTon(wallet.address, args.ton_api_url, args.ton_api_key)
    service = GameService(store, journal, gamble_enabled=not args.no_gamble, rewards_enabled=not args.no_rewards, wallet=wallet, ton_provider=provider)
    generated = service.ensure_admin(args.admin_password)
    if generated and not args.admin_password:
        args.data.mkdir(parents=True, exist_ok=True)
        pw_file = args.data / "admin_password.txt"
        pw_file.write_text(generated + "\n", encoding="utf-8")
        print(f"Admin password generated and saved to {pw_file} (shown only here, change it for real use)", flush=True)
    if store.migrated:
        print(f"{store.migrated} old open account(s) renamed legacy_* (they can not log in; an admin can reset their password)", flush=True)
    if journal.corrupt_lines:
        print(f"WARNING: {journal.corrupt_lines} unreadable journal line(s) skipped", flush=True)
    if wallet.enabled and args.wallet == "ton":
        def poll():                                       # credits new deposits every 20 s; errors are shown in the admin cabinet
            while True:
                res = service.scan_deposits()
                if res.get("error"):
                    print("TON scan:", res["error"], flush=True)
                time.sleep(20)
        threading.Thread(target=poll, daemon=True).start()
    if wallet.enabled:
        print(f"TON wallet: {args.wallet} on {args.ton_network}, deposits to {wallet.address}", flush=True)
    server = make_server(service, args.host, args.port, trust_proxy=args.trust_proxy, web_dir=args.web_dir)
    print(f"FWSlot server on http://{args.host}:{args.port}  admin panel: /admin  data: {args.data}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
