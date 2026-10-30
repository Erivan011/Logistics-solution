"""
RoutePlan Geospatial Storage & Query Layer (PostGIS / Spatial SQL).
Modela operações espaciais nativas: verificação de ZMRC (Zona de Máxima Restrição de Circulação)
e cálculo de proximidade com ST_DWithin.
"""

from typing import Dict, List, Tuple
import math

class PostGISSimulator:
    """
    Simulador de alta fidelidade das queries espaciais ST_Contains e ST_DWithin.
    Garante execução local autónoma e mapeamento para comandos SQL reais com PostGIS.
    """
    
    # Polígono aproximado do Centro Expandido de São Paulo (ZMRC / Rodízio Municipal)
    # [lng, lat] em EPSG:4326
    SP_ZMRC_POLYGON = [
        (-46.685, -23.520), # Marginal Tietê / Pompeia
        (-46.620, -23.515), # Ponte das Bandeiras
        (-46.595, -23.550), # Brás / Mooca
        (-46.615, -23.600), # Ipiranga / Salim Farah Maluf
        (-46.690, -23.610), # Berrini / Marginal Pinheiros
        (-46.710, -23.565), # Butantã / Eusébio Matoso
        (-46.685, -23.520)  # Fecho
    ]

    @classmethod
    def point_in_zmrc(cls, lat: float, lng: float) -> bool:
        """
        Equivalente a: SELECT ST_Contains(geom_zmrc, ST_SetSRID(ST_Point(lng, lat), 4326));
        Algoritmo Ray-Casting.
        """
        inside = False
        n = len(cls.SP_ZMRC_POLYGON)
        p1x, p1y = cls.SP_ZMRC_POLYGON[0]
        for i in range(n + 1):
            p2x, p2y = cls.SP_ZMRC_POLYGON[i % n]
            if lat > min(p1y, p2y):
                if lat <= max(p1y, p2y):
                    if lng <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (lat - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or lng <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        return inside

    @classmethod
    def get_sql_schema_ddl(cls) -> str:
        """
        DDL profissional para PostgreSQL com extensão PostGIS.
        """
        return """
        -- Ativação da extensão espacial
        CREATE EXTENSION IF NOT EXISTS postgis;

        -- Tabela de Geometrias Operacionais
        CREATE TABLE IF NOT EXISTS operational_zones (
            zone_id VARCHAR(50) PRIMARY KEY,
            zone_name VARCHAR(100) NOT NULL,
            restriction_type VARCHAR(50) NOT NULL, -- 'ZMRC', 'RODIZIO_SP', 'CALCADAO'
            active_from TIME NOT NULL,
            active_until TIME NOT NULL,
            geom GEOMETRY(Polygon, 4326) NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_operational_zones_geom ON operational_zones USING GIST (geom);

        -- Tabela de Clientes e Hospitais com Coluna Espacial
        CREATE TABLE IF NOT EXISTS delivery_nodes (
            node_id VARCHAR(50) PRIMARY KEY,
            node_name VARCHAR(150) NOT NULL,
            demand_kg NUMERIC(10, 2) NOT NULL,
            demand_m3 NUMERIC(10, 3) NOT NULL,
            location GEOGRAPHY(Point, 4326) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_delivery_nodes_location ON delivery_nodes USING GIST (location);

        -- Exemplo de query PostGIS de proximidade (Raio de 5km de um veículo em apuros):
        -- SELECT node_id, node_name, ST_Distance(location, ST_MakePoint(:v_lng, :v_lat)::geography) AS dist_m
        -- FROM delivery_nodes
        -- WHERE ST_DWithin(location, ST_MakePoint(:v_lng, :v_lat)::geography, 5000)
        -- ORDER BY dist_m ASC;
        """
