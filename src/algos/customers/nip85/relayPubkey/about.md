Each customer has a unique nsec key that is used to sign their kind 30382 events.

The nsec key is stored in the /etc/brainstorm.conf file.

For a customer with pubkey: <pk_0>, the nsec key is stored in the /etc/brainstorm.conf file as:

#################### CUSTOMER id: <id_0> ####################
# PUBKEY: <pk_0>
# NAME: <name_0>
export CUSTOMER_<pk_0>_RELAY_PUBKEY='...'
export CUSTOMER_<pk_0>_RELAY_NPUB='...'
export CUSTOMER_<pk_0>_RELAY_PRIVKEY='...'
export CUSTOMER_<pk_0>_RELAY_NSEC='...'
#############################################################

