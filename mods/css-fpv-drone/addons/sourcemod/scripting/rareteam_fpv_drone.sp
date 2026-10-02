#include <sourcemod>
#include <sdktools>
#include <sdkhooks>

#pragma semicolon 1
#pragma newdecls required

public Plugin myinfo =
{
    name = "rareteam FPV Drone",
    author = "rareteam",
    description = "Controllable first-person attack drone for Counter-Strike: Source",
    version = "1.0.0",
    url = "https://github.com/JesseRare/rareteam-project"
};

#define INVALID_DRONE -1
#define DRONE_MODEL "models/combine_scanner.mdl"

ConVar g_Enabled;
ConVar g_Speed;
ConVar g_Health;
ConVar g_Lifetime;
ConVar g_Cooldown;
ConVar g_Damage;
ConVar g_Radius;
ConVar g_Maximum;

int g_Drone[MAXPLAYERS + 1];
int g_Camera[MAXPLAYERS + 1];
int g_DroneHealth[MAXPLAYERS + 1];
int g_LastButtons[MAXPLAYERS + 1];
float g_ExpiresAt[MAXPLAYERS + 1];
float g_CooldownUntil[MAXPLAYERS + 1];
float g_NextHudAt[MAXPLAYERS + 1];
MoveType g_PreviousMoveType[MAXPLAYERS + 1];
float g_LastFrameAt;

public void OnPluginStart()
{
    g_Enabled = CreateConVar("sm_fpv_enabled", "1", "Enable rareteam FPV drones", FCVAR_NOTIFY, true, 0.0, true, 1.0);
    g_Speed = CreateConVar("sm_fpv_speed", "520", "Drone flight speed", FCVAR_NOTIFY, true, 100.0, true, 1200.0);
    g_Health = CreateConVar("sm_fpv_health", "60", "Drone health", FCVAR_NOTIFY, true, 1.0, true, 500.0);
    g_Lifetime = CreateConVar("sm_fpv_lifetime", "25", "Maximum flight time in seconds", FCVAR_NOTIFY, true, 5.0, true, 120.0);
    g_Cooldown = CreateConVar("sm_fpv_cooldown", "35", "Cooldown after a flight", FCVAR_NOTIFY, true, 0.0, true, 300.0);
    g_Damage = CreateConVar("sm_fpv_damage", "180", "Explosion damage", FCVAR_NOTIFY, true, 0.0, true, 500.0);
    g_Radius = CreateConVar("sm_fpv_radius", "300", "Explosion radius", FCVAR_NOTIFY, true, 32.0, true, 1000.0);
    g_Maximum = CreateConVar("sm_fpv_maximum", "4", "Maximum simultaneous drones", FCVAR_NOTIFY, true, 1.0, true, 32.0);

    RegConsoleCmd("sm_fpv", Command_Fpv, "Launch or cancel an FPV drone");
    HookEvent("player_death", Event_PlayerDeath);
    HookEvent("round_end", Event_RoundEnd);
    AutoExecConfig(true, "rareteam_fpv_drone");

    for (int client = 1; client <= MaxClients; client++)
    {
        ResetClientState(client);
    }
}

public void OnMapStart()
{
    PrecacheModel(DRONE_MODEL, true);
    g_LastFrameAt = GetGameTime();
}

public void OnClientPutInServer(int client)
{
    ResetClientState(client);
}

public void OnClientDisconnect(int client)
{
    StopDrone(client, false, false);
    ResetClientState(client);
}

public void OnPluginEnd()
{
    for (int client = 1; client <= MaxClients; client++)
    {
        StopDrone(client, false, false);
    }
}

void ResetClientState(int client)
{
    g_Drone[client] = INVALID_DRONE;
    g_Camera[client] = INVALID_DRONE;
    g_DroneHealth[client] = 0;
    g_LastButtons[client] = 0;
    g_ExpiresAt[client] = 0.0;
    g_CooldownUntil[client] = 0.0;
    g_NextHudAt[client] = 0.0;
    g_PreviousMoveType[client] = MOVETYPE_WALK;
}

public Action Command_Fpv(int client, int args)
{
    if (client <= 0 || !IsClientInGame(client))
    {
        ReplyToCommand(client, "[rareteam] Команда доступна только игроку.");
        return Plugin_Handled;
    }
    if (!g_Enabled.BoolValue)
    {
        PrintToChat(client, "\x04[rareteam]\x01 FPV-дроны отключены.");
        return Plugin_Handled;
    }
    if (IsDroneActive(client))
    {
        StopDrone(client, false, true);
        PrintToChat(client, "\x04[rareteam]\x01 Управление дроном отменено.");
        return Plugin_Handled;
    }
    if (!IsPlayerAlive(client))
    {
        PrintToChat(client, "\x04[rareteam]\x01 Дрон можно запустить только живым игроком.");
        return Plugin_Handled;
    }
    float remaining = g_CooldownUntil[client] - GetGameTime();
    if (remaining > 0.0)
    {
        PrintToChat(client, "\x04[rareteam]\x01 Дрон будет готов через %.0f сек.", remaining);
        return Plugin_Handled;
    }
    if (CountActiveDrones() >= g_Maximum.IntValue)
    {
        PrintToChat(client, "\x04[rareteam]\x01 Достигнут лимит активных дронов.");
        return Plugin_Handled;
    }
    StartDrone(client);
    return Plugin_Handled;
}

void StartDrone(int client)
{
    float eye[3], angles[3], forwardVec[3], origin[3];
    GetClientEyePosition(client, eye);
    GetClientEyeAngles(client, angles);
    GetAngleVectors(angles, forwardVec, NULL_VECTOR, NULL_VECTOR);
    origin[0] = eye[0] + forwardVec[0] * 72.0;
    origin[1] = eye[1] + forwardVec[1] * 72.0;
    origin[2] = eye[2] + 18.0;

    int drone = CreateEntityByName("prop_dynamic_override");
    int camera = CreateEntityByName("point_viewcontrol");
    if (drone == -1 || camera == -1)
    {
        if (drone != -1) AcceptEntityInput(drone, "Kill");
        if (camera != -1) AcceptEntityInput(camera, "Kill");
        PrintToChat(client, "\x04[rareteam]\x01 Не удалось создать FPV-дрон.");
        return;
    }

    DispatchKeyValue(drone, "model", DRONE_MODEL);
    DispatchKeyValue(drone, "solid", "6");
    DispatchSpawn(drone);
    ActivateEntity(drone);
    if (HasEntProp(drone, Prop_Data, "m_takedamage")) SetEntProp(drone, Prop_Data, "m_takedamage", 2);
    if (HasEntProp(drone, Prop_Data, "m_iHealth")) SetEntProp(drone, Prop_Data, "m_iHealth", g_Health.IntValue);
    SetEntityMoveType(drone, MOVETYPE_FLY);
    TeleportEntity(drone, origin, angles, NULL_VECTOR);
    SDKHook(drone, SDKHook_OnTakeDamage, OnDroneTakeDamage);

    DispatchSpawn(camera);
    TeleportEntity(camera, origin, angles, NULL_VECTOR);

    g_Drone[client] = EntIndexToEntRef(drone);
    g_Camera[client] = EntIndexToEntRef(camera);
    g_DroneHealth[client] = g_Health.IntValue;
    g_ExpiresAt[client] = GetGameTime() + g_Lifetime.FloatValue;
    g_LastButtons[client] = GetClientButtons(client);
    g_NextHudAt[client] = 0.0;
    g_PreviousMoveType[client] = GetEntityMoveType(client);

    SetEntityMoveType(client, MOVETYPE_NONE);
    SetClientViewEntity(client, camera);
    PrintToChat(client, "\x04[rareteam]\x01 FPV: WASD — полёт, ПРОБЕЛ/CTRL — высота, ЛКМ — подрыв, ПКМ — отмена.");
}

public void OnGameFrame()
{
    float now = GetGameTime();
    float delta = now - g_LastFrameAt;
    g_LastFrameAt = now;
    if (delta <= 0.0 || delta > 0.1) delta = 0.015;

    for (int client = 1; client <= MaxClients; client++)
    {
        if (g_Drone[client] == INVALID_DRONE) continue;
        if (!IsDroneActive(client))
        {
            StopDrone(client, false, true);
            continue;
        }
        if (!IsClientInGame(client) || !IsPlayerAlive(client))
        {
            StopDrone(client, false, false);
            continue;
        }
        if (now >= g_ExpiresAt[client])
        {
            StopDrone(client, true, true);
            continue;
        }
        UpdateDrone(client, delta, now);
    }
}

void UpdateDrone(int client, float delta, float now)
{
    int drone = EntRefToEntIndex(g_Drone[client]);
    int camera = EntRefToEntIndex(g_Camera[client]);
    if (drone == INVALID_ENT_REFERENCE || camera == INVALID_ENT_REFERENCE)
    {
        StopDrone(client, false, true);
        return;
    }

    int buttons = GetClientButtons(client);
    int pressed = buttons & ~g_LastButtons[client];
    g_LastButtons[client] = buttons;
    if ((pressed & IN_ATTACK) != 0)
    {
        StopDrone(client, true, true);
        return;
    }
    if ((pressed & IN_ATTACK2) != 0)
    {
        StopDrone(client, false, true);
        return;
    }

    float angles[3], forwardVec[3], rightVec[3], upVec[3], direction[3];
    GetClientEyeAngles(client, angles);
    angles[2] = 0.0;
    GetAngleVectors(angles, forwardVec, rightVec, upVec);
    if ((buttons & IN_FORWARD) != 0) AddVectors(direction, forwardVec, direction);
    if ((buttons & IN_BACK) != 0) SubtractVectors(direction, forwardVec, direction);
    if ((buttons & IN_MOVERIGHT) != 0) AddVectors(direction, rightVec, direction);
    if ((buttons & IN_MOVELEFT) != 0) SubtractVectors(direction, rightVec, direction);
    if ((buttons & IN_JUMP) != 0) direction[2] += 1.0;
    if ((buttons & IN_DUCK) != 0) direction[2] -= 1.0;

    float start[3], destination[3], velocity[3];
    GetEntPropVector(drone, Prop_Send, "m_vecOrigin", start);
    if (GetVectorLength(direction) > 0.01)
    {
        NormalizeVector(direction, direction);
        ScaleVector(direction, g_Speed.FloatValue * delta);
        AddVectors(start, direction, destination);
        float mins[3] = { -10.0, -10.0, -6.0 };
        float maxs[3] = { 10.0, 10.0, 6.0 };
        Handle trace = TR_TraceHullFilterEx(start, destination, mins, maxs, MASK_SOLID, TraceFilter_Drone, drone);
        TR_GetEndPosition(destination, trace);
        delete trace;
        ScaleVector(direction, 1.0 / delta);
        velocity = direction;
    }
    else
    {
        destination = start;
        velocity[0] = velocity[1] = velocity[2] = 0.0;
    }
    TeleportEntity(drone, destination, angles, velocity);
    destination[2] += 5.0;
    TeleportEntity(camera, destination, angles, NULL_VECTOR);

    if (now >= g_NextHudAt[client])
    {
        g_NextHudAt[client] = now + 0.25;
        PrintHintText(client, "FPV  |  HP %d  |  %.0f сек.\nЛКМ: ПОДРЫВ   ПКМ: ВЫХОД", g_DroneHealth[client], g_ExpiresAt[client] - now);
    }
}

public bool TraceFilter_Drone(int entity, int contentsMask, any data)
{
    return entity != data;
}

public Action OnDroneTakeDamage(int entity, int &attacker, int &inflictor, float &damage, int &damageType)
{
    int client = FindDroneOwner(entity);
    if (client == 0) return Plugin_Continue;
    g_DroneHealth[client] -= RoundToCeil(damage);
    if (g_DroneHealth[client] <= 0) StopDrone(client, true, true);
    return Plugin_Handled;
}

int FindDroneOwner(int entity)
{
    for (int client = 1; client <= MaxClients; client++)
    {
        if (EntRefToEntIndex(g_Drone[client]) == entity) return client;
    }
    return 0;
}

void StopDrone(int client, bool explode, bool applyCooldown)
{
    int drone = EntRefToEntIndex(g_Drone[client]);
    int camera = EntRefToEntIndex(g_Camera[client]);
    float origin[3];
    if (drone != INVALID_ENT_REFERENCE) GetEntPropVector(drone, Prop_Send, "m_vecOrigin", origin);

    g_Drone[client] = INVALID_DRONE;
    g_Camera[client] = INVALID_DRONE;
    g_DroneHealth[client] = 0;
    g_ExpiresAt[client] = 0.0;
    g_LastButtons[client] = 0;

    if (IsClientInGame(client))
    {
        SetClientViewEntity(client, client);
        if (IsPlayerAlive(client)) SetEntityMoveType(client, g_PreviousMoveType[client]);
        PrintHintText(client, "");
    }
    if (camera != INVALID_ENT_REFERENCE) AcceptEntityInput(camera, "Kill");
    if (drone != INVALID_ENT_REFERENCE)
    {
        SDKUnhook(drone, SDKHook_OnTakeDamage, OnDroneTakeDamage);
        AcceptEntityInput(drone, "Kill");
    }
    if (explode && drone != INVALID_ENT_REFERENCE) CreateDroneExplosion(client, origin);
    if (applyCooldown) g_CooldownUntil[client] = GetGameTime() + g_Cooldown.FloatValue;
}

void CreateDroneExplosion(int client, const float origin[3])
{
    int explosion = CreateEntityByName("env_explosion");
    if (explosion == -1) return;
    char value[16];
    IntToString(g_Damage.IntValue, value, sizeof(value));
    DispatchKeyValue(explosion, "iMagnitude", value);
    IntToString(g_Radius.IntValue, value, sizeof(value));
    DispatchKeyValue(explosion, "iRadiusOverride", value);
    DispatchKeyValue(explosion, "spawnflags", "0");
    DispatchSpawn(explosion);
    TeleportEntity(explosion, origin, NULL_VECTOR, NULL_VECTOR);
    if (client > 0 && IsClientInGame(client) && HasEntProp(explosion, Prop_Data, "m_hOwnerEntity"))
    {
        SetEntPropEnt(explosion, Prop_Data, "m_hOwnerEntity", client);
    }
    AcceptEntityInput(explosion, "Explode");
    AcceptEntityInput(explosion, "Kill");
}

bool IsDroneActive(int client)
{
    return client > 0 && client <= MaxClients && EntRefToEntIndex(g_Drone[client]) != INVALID_ENT_REFERENCE;
}

int CountActiveDrones()
{
    int count = 0;
    for (int client = 1; client <= MaxClients; client++) if (IsDroneActive(client)) count++;
    return count;
}

public void Event_PlayerDeath(Event event, const char[] name, bool dontBroadcast)
{
    int client = GetClientOfUserId(event.GetInt("userid"));
    if (client > 0) StopDrone(client, false, false);
}

public void Event_RoundEnd(Event event, const char[] name, bool dontBroadcast)
{
    for (int client = 1; client <= MaxClients; client++) StopDrone(client, false, false);
}
