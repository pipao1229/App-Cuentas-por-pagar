import os
import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET")

    print(f"JWT Secret cargado: {jwt_secret[:10] if jwt_secret else 'NINGUNO'}...")
    print(f"Token recibido: {token[:30]}...")

    if not jwt_secret:
        raise HTTPException(status_code=500, detail="JWT secret no configurado")

    try:
        payload = jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            audience="authenticated"
        )
        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError as e:
        print(f"Error de token: {e}")
        raise HTTPException(status_code=401, detail=f"Token inválido: {str(e)}")