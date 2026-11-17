// =============================================================
// cmd_handler.h  -  Process Pi commands and drive ESP-NOW
// =============================================================
#pragma once
#include "protocol.h"

// Process one command from Pi.
// Blocks until robot ACK received OR timeout.
// Sends appropriate response (ack / fault) to Pi via xTxQueue.
void cmd_handle(const PiCommand *cmd);
