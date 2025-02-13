# API tester integrated with betteruptime incidents & hearbeat monitoring

## Usage
Create a `config.json`` file and fill in the required info:
```json
{
  "betteruptime": {
    "create_incident": true, // enable automatic incident creation in betterstack
    "create_grouped_incident": false, // if true this will create a single incident foor all teste api's and controllers (not implemented)
    "token": "$AUTH_TOKEN",
    "heartbeat": "$HEARTBEAT_ID",
    "incident_options": { // default options for the created incident(s)
      "name": "API Test ERROR!",
      "requester_email": "$USER_EMAIL",
      "email": true,
      "team_wait": 300
    }
  }
}
```
Create a `configs` folder in which you can create a config per api, example `./configs/pcm-v4-api.json`
```json
{
  "name": "example-api-v1",
  "base_url": "https://api.example.com/v1",
  "default_options": {
    "check_data": true,
    "check_status": "success",
    "check_status_code": 200,
    "check_checksum": true
  },
  "controllers": {
    "data/attributes": {
      "check_length": 200,
      "check_execution_time": 100,
      "check_object_name": "attributes",
      "check_object_properties": [
        "id",
        "attribute",
        "group",
        "name",
        "name.nl",
        "name.fr"
      ]
    }
  }
}
```

### Expected API result
By default we expect the followinf results from the API:
```json
{
  "status": "success",
  "code": 200,
  "data": {
    // properties
    "length": 1, // amount of items in first property (optional)
    "checksum": "controlchecksum" // (optional)
  },
  "executionTime": 13.83924729432 // execution time of backend code in miliseconds (optional)
}
```
`data` can also be aan array, in which case the length will be based on the array length of data.  
Other response formats are also supported but will have to be declared in full, example in config (not yet implemented):
```json
{
  "name": ...,
  "controllers": {
    "controller-name": {
      ...,
      "check_response_body": {
        "properties": {
          "name_of_property": {
            "type": "string",
            "expect_exact_value": "value_to_expect"
          },
          "name_of_optional_property": {
            "type": "number",
            "optional": true,
            "expect_min_value": 10,
            "expect_max_value": 100
          }
        }
      }
    }
  }
}
```

### Crontab
```bash
*/15 * * * * docker run --rm --name api-tester --mount type=bind,src=/home/jamievangeysel/api-tester/config.json,dst=/usr/src/app/config.json --mount type=bind,src=/home/jamievangeysel/api-tester/configs,dst=/usr/src/app/configs groupclaes/api-tests-betteruptime:latest
```