"""
RoutePlan Cold Chain Telemetry & Automated Safeguard Engine.
Monitorização em tempo real de sensores térmicos (2°C a 8°C) em conformidade com RDC ANVISA 430/2020.
Deteta anomalias térmicas e aciona desvios de emergência automáticos.
"""

from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
import time

@dataclass
class TemperatureTelemetrySample:
    vehicle_id: str
    timestamp_epoch: int
    temp_celsius: float
    lat: float
    lng: float
    door_open: bool = False

@dataclass
class ColdChainAlert:
    vehicle_id: str
    alert_level: str  # "INFO", "WARNING", "CRITICAL_SPOILED_RISK"
    current_temp: float
    consecutive_breaches: int
    recommended_action: str
    nearest_hub_redirect: Optional[str] = None

class ColdChainMonitor:
    def __init__(self, min_temp: float = 2.0, max_temp: float = 8.0, critical_samples_threshold: int = 3):
        self.min_temp = min_temp
        self.max_temp = max_temp
        self.threshold = critical_samples_threshold
        # Histórico por veículo: list of float
        self.history: Dict[str, List[TemperatureTelemetrySample]] = {}

    def process_telemetry(self, sample: TemperatureTelemetrySample) -> Optional[ColdChainAlert]:
        """
        Processa cada amostra de telemetria recebida via MQTT / WebSocket.
        Gera alerta crítico se a temperatura violar a faixa regulatória consecutivamente.
        """
        if sample.vehicle_id not in self.history:
            self.history[sample.vehicle_id] = []

        self.history[sample.vehicle_id].append(sample)
        recent = self.history[sample.vehicle_id][-self.threshold:]

        # Contar violações consecutivas
        breaches = sum(1 for s in recent if s.temp_celsius < self.min_temp or s.temp_celsius > self.max_temp)

        if breaches >= self.threshold:
            avg_temp = sum(s.temp_celsius for s in recent) / len(recent)
            return ColdChainAlert(
                vehicle_id=sample.vehicle_id,
                alert_level="CRITICAL_SPOILED_RISK",
                current_temp=round(sample.temp_celsius, 2),
                consecutive_breaches=breaches,
                recommended_action="DESVIO IMEDIATO PARA PONTO DE REFRIGERAÇÃO MAIS PRÓXIMO",
                nearest_hub_redirect="HUB-APOIO-CENTRAL-SP"
            )
        elif sample.temp_celsius > self.max_temp or sample.temp_celsius < self.min_temp:
            return ColdChainAlert(
                vehicle_id=sample.vehicle_id,
                alert_level="WARNING",
                current_temp=round(sample.temp_celsius, 2),
                consecutive_breaches=1,
                recommended_action="VERIFICAR COMPRESSOR E VEDAÇÃO DA PORTA"
            )

        return None
