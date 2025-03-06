import requests
from neo4j import GraphDatabase

class ETLPipeline:
    def __init__(self, neo4j_uri, neo4j_user, neo4j_password):
        self.driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))

    def extract(self, nostr_relay_url):
        response = requests.get(nostr_relay_url)
        if response.status_code == 200:
            return response.json()  # Assuming the data is in JSON format
        else:
            raise Exception(f'Error fetching data: {response.status_code}')

    def transform(self, data):
        # Transform the data as needed for Neo4j
        transformed_data = []
        for item in data:
            # Example transformation
            transformed_data.append({
                'id': item.get('id'),
                'content': item.get('content'),
                'timestamp': item.get('timestamp'),
            })
        return transformed_data

    def load(self, data):
        with self.driver.session() as session:
            for item in data:
                session.run("CREATE (n:Message {id: $id, content: $content, timestamp: $timestamp})", 
                            id=item['id'], content=item['content'], timestamp=item['timestamp'])

    def run(self, nostr_relay_url):
        data = self.extract(nostr_relay_url)
        transformed_data = self.transform(data)
        self.load(transformed_data)

# Example usage:
# pipeline = ETLPipeline('bolt://localhost:7687', 'neo4j', 'password')
# pipeline.run('http://nostr.relay.url')
