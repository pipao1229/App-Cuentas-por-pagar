import os
import jwt
import json
import base64
import httpx
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePublicKey
from jwt.algorithms import ECAlgorithm

security = HTTPBearer()

_public_key_cache = None

async def get_supabase_public_key():
    global _public_key_cache
    if _public_key_cache:
        return _public_key_cache

    supabase_url = os.getenv("SUPABASE_URL")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{supabase_url}/auth/v1/.well-known/jwks.json")
        jwks = response.json()

    # Toma la primera clave del JWKS
    key_data = jwks["keys"][0]
    _public_key_cache = ECAlgorithm.from_jwk(json.dumps(key_data))
    return _public_key_cache

async def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials

    try:
        public_key = await get_supabase_public_key()
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["ES256"],
            audience="authenticated"
        )
        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {str(e)}")