from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Burger Drop Game API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class Hazard(BaseModel):
    type: str  # 'knife', 'fire', 'grill'
    x: float
    y: float
    width: float
    height: float
    rotation: Optional[float] = 0

class Obstacle(BaseModel):
    x: float
    y: float
    width: float
    height: float

class Target(BaseModel):
    x: float
    y: float
    width: float
    height: float

class Level(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    level_number: int
    dispenser_x: float
    dispenser_y: float
    target: Target
    hazards: List[Hazard] = []
    obstacles: List[Obstacle] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class LevelCreate(BaseModel):
    level_number: int
    dispenser_x: float
    dispenser_y: float
    target: Target
    hazards: List[Hazard] = []
    obstacles: List[Obstacle] = []

class BackgroundImage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    image_data: str  # Base64 encoded image
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BackgroundImageCreate(BaseModel):
    name: str
    image_data: str  # Base64 encoded image

class GameProgress(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    player_id: str
    current_level: int
    completed_levels: List[int] = []
    total_attempts: int = 0
    total_wins: int = 0
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class GameProgressUpdate(BaseModel):
    current_level: Optional[int] = None
    completed_level: Optional[int] = None
    add_attempt: bool = False
    add_win: bool = False

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Health check
@api_router.get("/")
async def root():
    return {"message": "Burger Drop Game API", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "burger-drop-game"}

# Level endpoints
@api_router.get("/levels", response_model=List[Level])
async def get_levels():
    """Get all custom levels"""
    levels = await db.levels.find().sort("level_number", 1).to_list(100)
    return [Level(**level) for level in levels]

@api_router.get("/levels/{level_number}", response_model=Level)
async def get_level(level_number: int):
    """Get a specific level by number"""
    level = await db.levels.find_one({"level_number": level_number})
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    return Level(**level)

@api_router.post("/levels", response_model=Level)
async def create_level(level_data: LevelCreate):
    """Create a new custom level"""
    level = Level(**level_data.dict())
    await db.levels.insert_one(level.dict())
    return level

@api_router.delete("/levels/{level_number}")
async def delete_level(level_number: int):
    """Delete a custom level"""
    result = await db.levels.delete_one({"level_number": level_number})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Level not found")
    return {"message": "Level deleted successfully"}

# Background image endpoints
@api_router.get("/backgrounds", response_model=List[BackgroundImage])
async def get_backgrounds():
    """Get all saved background images"""
    backgrounds = await db.backgrounds.find().to_list(50)
    return [BackgroundImage(**bg) for bg in backgrounds]

@api_router.post("/backgrounds", response_model=BackgroundImage)
async def save_background(background_data: BackgroundImageCreate):
    """Save a background image (base64 encoded)"""
    # Validate base64 data
    try:
        # Check if it's valid base64
        if background_data.image_data.startswith('data:image'):
            # Extract base64 part
            base64_data = background_data.image_data.split(',')[1]
        else:
            base64_data = background_data.image_data
        base64.b64decode(base64_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")
    
    background = BackgroundImage(**background_data.dict())
    await db.backgrounds.insert_one(background.dict())
    return background

@api_router.delete("/backgrounds/{background_id}")
async def delete_background(background_id: str):
    """Delete a saved background image"""
    result = await db.backgrounds.delete_one({"id": background_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Background not found")
    return {"message": "Background deleted successfully"}

# Game progress endpoints
@api_router.get("/progress/{player_id}", response_model=GameProgress)
async def get_progress(player_id: str):
    """Get player's game progress"""
    progress = await db.progress.find_one({"player_id": player_id})
    if not progress:
        # Create new progress for player
        new_progress = GameProgress(player_id=player_id, current_level=1)
        await db.progress.insert_one(new_progress.dict())
        return new_progress
    return GameProgress(**progress)

@api_router.put("/progress/{player_id}", response_model=GameProgress)
async def update_progress(player_id: str, update: GameProgressUpdate):
    """Update player's game progress"""
    progress = await db.progress.find_one({"player_id": player_id})
    if not progress:
        progress = GameProgress(player_id=player_id, current_level=1).dict()
    
    update_data = {"updated_at": datetime.utcnow()}
    
    if update.current_level is not None:
        update_data["current_level"] = update.current_level
    
    if update.completed_level is not None:
        completed = progress.get("completed_levels", [])
        if update.completed_level not in completed:
            completed.append(update.completed_level)
        update_data["completed_levels"] = completed
    
    if update.add_attempt:
        update_data["total_attempts"] = progress.get("total_attempts", 0) + 1
    
    if update.add_win:
        update_data["total_wins"] = progress.get("total_wins", 0) + 1
    
    await db.progress.update_one(
        {"player_id": player_id},
        {"$set": update_data},
        upsert=True
    )
    
    updated_progress = await db.progress.find_one({"player_id": player_id})
    return GameProgress(**updated_progress)

# Leaderboard
@api_router.get("/leaderboard")
async def get_leaderboard(limit: int = 10):
    """Get top players by completed levels and wins"""
    pipeline = [
        {
            "$project": {
                "player_id": 1,
                "total_wins": 1,
                "total_attempts": 1,
                "completed_count": {"$size": {"$ifNull": ["$completed_levels", []]}}
            }
        },
        {"$sort": {"completed_count": -1, "total_wins": -1}},
        {"$limit": limit}
    ]
    results = await db.progress.aggregate(pipeline).to_list(limit)
    return results

# Status check (original endpoint)
@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
