from fastapi import FastAPI 
from fastapi.middleware.cors import CORSMiddleware
from Routes.route import route
app = FastAPI(title="007 Talha Bond Secret Service",description="007 Talha Bond")

# CORS config - allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(route)
